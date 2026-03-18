import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const STORAGE_KEY = 'mediportal.auth';
const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || 'http://localhost:8000';

export interface ChatRequest {
  patient_id: string;
  message: string;
}

export interface ChatResponse {
  response: string;
}

const getToken = async (): Promise<string | null> => {
  try {
    let saved: string | null;
    if (Platform.OS === 'web') {
      saved = localStorage.getItem(STORAGE_KEY);
    } else {
      saved = await SecureStore.getItemAsync(STORAGE_KEY);
    }
    if (!saved) return null;
    const parsed = JSON.parse(saved) as { token: string };
    return parsed.token;
  } catch {
    return null;
  }
};

export async function sendChatMessage(
  patientId: string,
  message: string
): Promise<string> {
  try {
    const token = await getToken();

    const response = await fetch(`${API_BASE_URL}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        patient_id: patientId,
        message: message,
      }),
    });

    if (!response.ok) {
      throw new Error(`Chat API error: ${response.status}`);
    }

    const data: ChatResponse = await response.json();
    return data.response;
  } catch (error) {
    console.error('Error sending chat message:', error);
    throw error;
  }
}