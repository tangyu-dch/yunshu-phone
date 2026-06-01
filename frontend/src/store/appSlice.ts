import { createSlice, PayloadAction } from '@reduxjs/toolkit'

interface AppState {
  /** SIP registration status */
  sipStatus: string
  /** WebSocket connection status */
  wsStatus: string
  /** Current call state: idle | ringing | in_progress */
  callState: string
  /** The phone number of current call */
  callNumber: string
  /** Call duration in seconds */
  callDuration: number
  /** Whether all connections are ready */
  connReady: boolean
  /** Connection step progress */
  connSteps: Array<{ name: string; status: string; error?: string }>
  /** Whether auto-call batch mode is active */
  isAutoCall: boolean
  /** Agent online status */
  agentOnline: boolean
  /** Whether app is in grayscale mode */
  isGrayscale: boolean
  /** Whether we're in a call */
  isCall: boolean
}

const initialState: AppState = {
  sipStatus: 'unregistered',
  wsStatus: 'disconnected',
  callState: 'idle',
  callNumber: '',
  callDuration: 0,
  connReady: false,
  connSteps: [],
  isAutoCall: false,
  agentOnline: true,
  isGrayscale: false,
  isCall: false,
}

const appSlice = createSlice({
  name: 'app',
  initialState,
  reducers: {
    setSipStatus(state, action: PayloadAction<string>) {
      state.sipStatus = action.payload
    },
    setWsStatus(state, action: PayloadAction<string>) {
      state.wsStatus = action.payload
    },
    setCallState(state, action: PayloadAction<string>) {
      state.callState = action.payload
      if (action.payload === 'idle') {
        state.callNumber = ''
        state.callDuration = 0
        state.isCall = false
      } else {
        state.isCall = true
      }
    },
    setCallNumber(state, action: PayloadAction<string>) {
      state.callNumber = action.payload
    },
    setCallDuration(state, action: PayloadAction<number>) {
      state.callDuration = action.payload
    },
    setConnReady(state, action: PayloadAction<boolean>) {
      state.connReady = action.payload
    },
    setConnSteps(state, action: PayloadAction<AppState['connSteps']>) {
      state.connSteps = action.payload
    },
    setIsAutoCall(state, action: PayloadAction<boolean>) {
      state.isAutoCall = action.payload
    },
    setAgentOnline(state, action: PayloadAction<boolean>) {
      state.agentOnline = action.payload
    },
    setGrayscale(state, action: PayloadAction<boolean>) {
      state.isGrayscale = action.payload
    },
    reset(state) {
      Object.assign(state, initialState)
    },
  },
})

export const {
  setSipStatus, setWsStatus, setCallState, setCallNumber,
  setCallDuration, setConnReady, setConnSteps, setIsAutoCall,
  setAgentOnline, setGrayscale, reset,
} = appSlice.actions

export default appSlice.reducer
