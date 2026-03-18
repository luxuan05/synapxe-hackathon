import { Platform } from 'react-native';

const DEPLOYED_BACKEND_BASE = 'https://synapxe-hackathon-backend.onrender.com';
const LOCAL_BACKEND_BASE =
  Platform.OS === 'android' ? 'http://10.0.2.2:8000' : 'http://127.0.0.1:8000';

export const API_BASE = process.env.EXPO_PUBLIC_API_BASE_URL?.trim()
  ? process.env.EXPO_PUBLIC_API_BASE_URL.trim()
  : __DEV__
    ? LOCAL_BACKEND_BASE
    : DEPLOYED_BACKEND_BASE;
