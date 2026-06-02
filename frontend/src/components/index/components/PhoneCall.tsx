import React, { useEffect, useRef, useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';

import * as AppBridge from '../../../../wailsjs/go/bridge/AppBridge';
import * as CallBridge from '../../../../wailsjs/go/bridge/CallBridge';
import { EventsOn, EventsOff } from '../../../../wailsjs/runtime/runtime';
import {
  setCallState,
  setCallNumber,
  setCallDuration,
  setConnReady,
  setConnSteps,
  setIsAutoCall,
  setSipStatus,
  setAgentOnline,
} from '../../../store/appSlice';
import { RootState } from '../../../store';
import { callAudio } from '../../../utils/audio';

import DialPad from './phone/DialPad';
import CallingView from './phone/CallingView';
import InCallView from './phone/InCallView';
import AutoCallView from './phone/AutoCallView';
import RegistrationStatus from './phone/RegistrationStatus';

const MOUSE_THROTTLE_MS = 2000;

const PhoneCall: React.FC = () => {
  const dispatch = useDispatch();

  const connReady = useSelector((s: RootState) => s.app.connReady);
  const connSteps = useSelector((s: RootState) => s.app.connSteps);
  const callState = useSelector((s: RootState) => s.app.callState);
  const callNumber = useSelector((s: RootState) => s.app.callNumber);
  const callDuration = useSelector((s: RootState) => s.app.callDuration);
  const isAutoCall = useSelector((s: RootState) => s.app.isAutoCall);
  const inactivityDurationSec = useSelector(
    (s: RootState) => s.user.inactivityDurationSec
  );
  const token = useSelector((s: RootState) => s.user.token);
  const userInfo = useSelector((s: RootState) => s.user.userInfo);

  const lastMouseReportRef = useRef<number>(0);

  // ─── Mouse activity reporter ──────────────────────────────────────────────
  const handleMouseMove = useCallback(() => {
    const now = Date.now();
    if (now - lastMouseReportRef.current >= MOUSE_THROTTLE_MS) {
      lastMouseReportRef.current = now;
      AppBridge.ReportMouseActivity().catch(() => {});
    }
  }, []);

  // ─── Connection retry ─────────────────────────────────────────────────────
  const retryConnection = useCallback(() => {
    dispatch(setConnReady(false));
    CallBridge.RetryConnection().catch((err: unknown) => {
      console.error('[PhoneCall] RetryConnection failed:', err);
    });
  }, [dispatch]);

  // ─── Manual call handler ──────────────────────────────────────────────────
  const handleManualCall = useCallback((number: string) => {
    CallBridge.MakeCall(number, 'yunshu', {}).catch((err: unknown) => {
      console.error('[PhoneCall] MakeCall failed:', err);
    });
  }, []);

  // ─── Hangup handler ───────────────────────────────────────────────────────
  const handleHangup = useCallback(() => {
    callAudio.stopAll();
    CallBridge.HangupCall('Manually').catch((err: unknown) => {
      console.error('[PhoneCall] HangupCall failed:', err);
    });
  }, []);

  // ─── Mount / Unmount ──────────────────────────────────────────────────────
  useEffect(() => {
    // Kick off the 3-step connection process
    const initConnect = async () => {
      if (token && userInfo) {
        try {
          await AppBridge.RestoreSession(token, userInfo as any, inactivityDurationSec);
        } catch (err) {
          console.error('[PhoneCall] RestoreSession failed:', err);
        }
      }
      AppBridge.Connect().catch((err: unknown) => {
        console.error('[PhoneCall] Connect failed:', err);
      });
    };
    initConnect();

    // ── Connection events ─────────────────────────────────────────────────
    EventsOn('conn:step', (steps: Array<{ name: string; status: string; error?: string }>) => {
      dispatch(setConnSteps(steps));
    });

    EventsOn('conn:ready', () => {
      dispatch(setConnReady(true));
      AppBridge.StartMouseMonitor(inactivityDurationSec).catch(() => {});
    });

    // ── SIP events ────────────────────────────────────────────────────────
    EventsOn('sip:registered', () => {
      dispatch(setSipStatus('registered'));
    });

    EventsOn('sip:disconnected', () => {
      dispatch(setSipStatus('disconnected'));
      CallBridge.RetryConnection().catch(() => {});
    });

    EventsOn('sip:failed', () => {
      dispatch(setSipStatus('failed'));
    });

    // ── Call lifecycle events ─────────────────────────────────────────────
    // Go emits: call:progress with displayNumber (string)
    EventsOn('call:progress', (displayNumber: string) => {
      dispatch(setCallState('ringing'));
      dispatch(setCallNumber(displayNumber || ''));
      callAudio.playRinging();
    });

    // Go emits: call:ring with nil (incoming call, already auto-answered in Go)
    EventsOn('call:ring', () => {
      dispatch(setCallState('ringing'));
      callAudio.playRinging();
    });

    // Go emits: call:answered with nil
    EventsOn('call:answered', () => {
      dispatch(setCallState('in_progress'));
      callAudio.playAnswered();
    });

    // Go emits: call:confirmed with nil
    EventsOn('call:confirmed', () => {
      dispatch(setCallState('in_progress'));
      callAudio.playAnswered();
    });

    // Go emits: call:ended with reason (string)
    EventsOn('call:ended', (_reason: string) => {
      callAudio.playHangup();
      dispatch(setCallState('idle'));
    });

    // Go emits: call:failed with {code, reason}
    EventsOn('call:failed', (_data: { code: number; reason: string }) => {
      callAudio.playHangup();
      dispatch(setCallState('idle'));
    });

    // Go emits: call:tick with duration in seconds (number)
    EventsOn('call:tick', (seconds: number) => {
      dispatch(setCallDuration(seconds));
    });

    // ── WebSocket command events ──────────────────────────────────────────
    // Go emits: ws:callPhone with decrypted phone data
    EventsOn(
      'ws:callPhone',
      (data: {
        phone: string;
        type: string;
        taskId?: string;
        taskPhoneId?: string;
        userId?: string;
      }) => {
        const extra: Record<string, string> = {};
        if (data.taskId) extra.taskId = data.taskId;
        if (data.taskPhoneId) extra.taskPhoneId = data.taskPhoneId;
        if (data.userId) extra.userId = data.userId;

        CallBridge.MakeCall(data.phone, data.type || 'BATCH_CALL', extra).catch(
          (err: unknown) => {
            console.error('[PhoneCall] ws:callPhone MakeCall failed:', err);
          }
        );
      }
    );

    // Go emits: ws:taskStatus with {option, afterState, taskId}
    EventsOn(
      'ws:taskStatus',
      (data: { option: boolean; afterState: string; taskId: string }) => {
        const shouldAutoCall = data.option && data.afterState === 'RUNNING';
        dispatch(setIsAutoCall(shouldAutoCall));
        CallBridge.SetAutoCallState(shouldAutoCall).catch(() => {});
      }
    );

    // ── Agent status ──────────────────────────────────────────────────────
    EventsOn('agent:status', (status: string) => {
      dispatch(setAgentOnline(status === 'online'));
    });

    // Attach mouse-move listener
    window.addEventListener('mousemove', handleMouseMove);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      callAudio.stopAll();

      const events = [
        'conn:step', 'conn:ready',
        'sip:registered', 'sip:disconnected', 'sip:failed',
        'call:progress', 'call:ring', 'call:answered', 'call:confirmed',
        'call:ended', 'call:failed', 'call:tick',
        'ws:callPhone', 'ws:taskStatus',
        'agent:status',
      ];
      events.forEach((e) => EventsOff(e));
    };
  }, [dispatch, inactivityDurationSec, handleMouseMove]);

  // ─── Render ───────────────────────────────────────────────────────────────
  if (!connReady) {
    return <RegistrationStatus steps={connSteps} onRetry={retryConnection} />;
  }

  if (callState === 'idle') {
    return isAutoCall ? <AutoCallView /> : <DialPad onCall={handleManualCall} />;
  }

  if (callState === 'ringing') {
    return (
      <CallingView
        phoneNumber={callNumber}
        duration={callDuration}
        onHangup={handleHangup}
      />
    );
  }

  if (callState === 'in_progress') {
    return (
      <InCallView
        phoneNumber={callNumber}
        duration={callDuration}
        onHangup={handleHangup}
      />
    );
  }

  return null;
};

export default PhoneCall;
