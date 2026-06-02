import React, { useEffect, useRef, useCallback, useMemo } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { Button, Typography, message } from 'antd';
import { LoadingOutlined, ReloadOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';

import * as AppBridge from '@wailsjs/go/bridge/AppBridge';
import * as CallBridge from '@wailsjs/go/bridge/CallBridge';
import { EventsOn, EventsOff } from '@wailsjs/runtime/runtime';
import {
  setCallState,
  setCallNumber,
  setCallDuration,
  setCallStatusText,
  setConnReady,
  setConnSteps,
  setIsAutoCall,
  setSipStatus,
  setAgentOnline,
} from '@/store/appSlice';
import { logout } from '@/store/userSlice';
import { RootState } from '@/store';
import { callAudio } from '@/utils/audio';

import DialPad from './phone/DialPad';
import CallingView from './phone/CallingView';
import InCallView from './phone/InCallView';
import AutoCallView from './phone/AutoCallView';

const { Text } = Typography;

const MOUSE_THROTTLE_MS = 2000;

const PhoneCall: React.FC = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const connReady = useSelector((s: RootState) => s.app.connReady);
  const connSteps = useSelector((s: RootState) => s.app.connSteps);
  const callState = useSelector((s: RootState) => s.app.callState);
  const callNumber = useSelector((s: RootState) => s.app.callNumber);
  const callDuration = useSelector((s: RootState) => s.app.callDuration);
  const callStatusText = useSelector((s: RootState) => s.app.callStatusText);
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
    // 立即在前端进入“呼叫中”状态以提供即时的界面回馈，避免界面在拨号盘上卡顿
    dispatch(setCallState('ringing'));
    dispatch(setCallNumber(number));
    dispatch(setCallDuration(0));
    dispatch(setCallStatusText('正在呼叫...'));

    CallBridge.MakeCall(number, 'yunshu', {}).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[PhoneCall] MakeCall failed:', msg);
      message.error(msg || '呼叫失败，请重试');
      // 呼叫失败时恢复闲置状态
      dispatch(setCallState('idle'));
    });
  }, [dispatch]);

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
      AppBridge.Connect().catch((err: any) => {
        console.error('[PhoneCall] Connect failed:', err);
        // 如果在连通过程中发生错误（如分机未分配/禁用），直接清理会话，跳转回登录页直接进行报错提示
        let msg = err?.message || String(err);
        msg = msg.replace(/^api error:\s*/i, '');
        msg = msg.replace(/^Error:\s*/i, '');
        msg = msg.replace(/^分机校验失败:\s*/i, '');
        msg = msg.replace(/^get extension info:\s*/i, '');
        msg = msg.replace(/^fetch extension:\s*/i, '');
        
        sessionStorage.setItem('login_error_msg', msg || '分机配置获取失败，请联系管理员。');
        
        AppBridge.Logout().catch(() => {});
        dispatch(logout());
        navigate('/login');
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
      dispatch(setCallStatusText('对方振铃中...'));
      callAudio.playRinging();
    });

    // Go emits: call:ring with nil (incoming call, already auto-answered in Go)
    EventsOn('call:ring', () => {
      dispatch(setCallState('ringing'));
      dispatch(setCallStatusText('对方振铃中...'));
      callAudio.playRinging();
    });

    // Go emits: call:answered with nil
    EventsOn('call:answered', () => {
      dispatch(setCallState('in_progress'));
      dispatch(setCallStatusText('通话中'));
      callAudio.playAnswered();
    });

    // Go emits: call:confirmed with nil
    EventsOn('call:confirmed', () => {
      dispatch(setCallState('in_progress'));
      dispatch(setCallStatusText('通话中'));
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
  }, [dispatch, inactivityDurationSec, handleMouseMove, navigate, token, userInfo]);

  // ─── Derive connection error from steps ────────────────────────────────────
  const connError = useMemo(() => {
    const failed = connSteps.find((s) => s.status === 'failed');
    return failed?.error || null;
  }, [connSteps]);

  // ─── Render ───────────────────────────────────────────────────────────────
  if (!connReady) {
    return (
      <div style={connStyles.container}>
        {connError ? (
          <>
            <Text style={connStyles.errorText}>{connError}</Text>
            <Button
              type="primary"
              icon={<ReloadOutlined />}
              onClick={retryConnection}
              style={connStyles.retryBtn}
            >
              重试连接
            </Button>
          </>
        ) : (
          <>
            <LoadingOutlined style={connStyles.spinner} spin />
            <Text style={connStyles.loadingText}>正在安全连通中枢...</Text>
          </>
        )}
      </div>
    );
  }

  if (callState === 'idle') {
    return isAutoCall ? <AutoCallView /> : <DialPad onCall={handleManualCall} />;
  }

  if (callState === 'ringing') {
    return (
      <CallingView
        phoneNumber={callNumber}
        duration={callDuration}
        statusText={callStatusText}
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

const connStyles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '48px 20px',
    gap: 16,
  },
  spinner: {
    fontSize: 28,
    color: '#6366f1',
  },
  loadingText: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.55)',
  },
  errorText: {
    fontSize: 13,
    color: '#ef4444',
    textAlign: 'center',
    lineHeight: 1.6,
    maxWidth: 260,
  },
  retryBtn: {
    borderRadius: 10,
    fontWeight: 600,
    fontSize: 13,
    background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
    border: 'none',
    boxShadow: '0 4px 12px rgba(99, 102, 241, 0.3)',
  },
};

export default PhoneCall;
