import { createSlice, PayloadAction } from '@reduxjs/toolkit'

export interface UserInfo {
  id: number
  username: string
  seatNumber: string
  roleDetail: {
    permissions: string[]
  }
}

interface UserState {
  isLoggedIn: boolean
  userInfo: UserInfo | null
  token: string
  inactivityDurationSec: number
}

const initialState: UserState = (() => {
  try {
    const saved = localStorage.getItem('yunshu_user')
    if (saved) return JSON.parse(saved)
  } catch { /* ignore */ }
  return { isLoggedIn: false, userInfo: null, token: '', inactivityDurationSec: 300 }
})()

const userSlice = createSlice({
  name: 'user',
  initialState,
  reducers: {
    login(state, action: PayloadAction<UserState>) {
      state.isLoggedIn = true
      state.userInfo = action.payload.userInfo
      state.token = action.payload.token
      state.inactivityDurationSec = action.payload.inactivityDurationSec
      localStorage.setItem('yunshu_user', JSON.stringify(state))
    },
    logout(state) {
      state.isLoggedIn = false
      state.userInfo = null
      state.token = ''
      localStorage.removeItem('yunshu_user')
    },
  },
})

export const { login, logout } = userSlice.actions
export default userSlice.reducer
