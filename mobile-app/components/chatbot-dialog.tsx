import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View, ActivityIndicator } from 'react-native';
import { sendChatMessage } from '../services/chatService';

type Message = { id: number; from: 'bot' | 'user'; text: string };

const initialMessages: Message[] = [
  {
    id: 1,
    from: 'bot',
    text: "Hello! I'm your AI health companion. I can help you with health concerns in English, Mandarin, Tamil or Malay. How are you feeling today?",
  },
];

interface ChatbotDialogProps {
  open: boolean;
  onClose: () => void;
  patientId?: string;
}

export function ChatbotDialog({ open, onClose, patientId = '0' }: ChatbotDialogProps) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const canSend = useMemo(() => input.trim().length > 0 && !isLoading, [input, isLoading]);

  const handleSend = async () => {
    if (!canSend) return;

    const userMessage: Message = { id: Date.now(), from: 'user', text: input.trim() };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      // Call your real chatbot backend!
      const botResponse = await sendChatMessage(patientId, userMessage.text);

      const botMessage: Message = {
        id: Date.now() + 1,
        from: 'bot',
        text: botResponse,
      };

      setMessages((prev) => [...prev, botMessage]);
    } catch (error) {
      console.error('Chat error:', error);
      const errorMessage: Message = {
        id: Date.now() + 1,
        from: 'bot',
        text: "I'm sorry, I'm having trouble connecting right now. Please make sure you're connected to the internet and try again.",
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />
        <View style={styles.panel}>
          <View style={styles.header}>
            <View>
              <Text style={styles.headerTitle}>Health Assistant</Text>
              <Text style={styles.headerSubtitle}>Always here to help</Text>
            </View>
            <Pressable style={styles.closeButton} onPress={onClose}>
              <Text style={styles.closeText}>×</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.messages}>
            {messages.map((msg) => (
              <View
                key={msg.id}
                style={[styles.bubbleRow, msg.from === 'user' ? styles.userRow : styles.botRow]}>
                <View style={[styles.bubble, msg.from === 'user' ? styles.userBubble : styles.botBubble]}>
                  <Text style={msg.from === 'user' ? styles.userBubbleText : styles.botBubbleText}>{msg.text}</Text>
                </View>
              </View>
            ))}
            {isLoading && (
              <View style={[styles.bubbleRow, styles.botRow]}>
                <View style={[styles.bubble, styles.botBubble]}>
                  <ActivityIndicator size="small" color="#7a35d5" />
                </View>
              </View>
            )}
          </ScrollView>

          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              placeholder="Type your message..."
              placeholderTextColor="#7d778a"
              value={input}
              onChangeText={setInput}
              onSubmitEditing={handleSend}
              returnKeyType="send"
              editable={!isLoading}
            />
            <Pressable 
              style={[styles.sendButton, !canSend && styles.sendButtonDisabled]} 
              onPress={handleSend}
              disabled={!canSend}
            >
              <Text style={styles.sendButtonText}>Send</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  panel: {
    height: '75%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: '#ffffff',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#7a35d5',
  },
  headerTitle: {
    color: '#f4ecff',
    fontSize: 37,
    fontWeight: '700',
    lineHeight: 39,
  },
  headerSubtitle: {
    marginTop: 1,
    color: '#e6d9fb',
    fontSize: 17,
    fontWeight: '500',
  },
  closeButton: {
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  closeText: {
    color: '#f4ecff',
    fontSize: 30,
    fontWeight: '300',
    lineHeight: 30,
  },
  messages: {
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  bubbleRow: {
    width: '100%',
    flexDirection: 'row',
  },
  userRow: {
    justifyContent: 'flex-end',
  },
  botRow: {
    justifyContent: 'flex-start',
  },
  bubble: {
    maxWidth: '88%',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  userBubble: {
    backgroundColor: '#7a35d5',
  },
  botBubble: {
    backgroundColor: '#ece6f3',
  },
  userBubbleText: {
    color: '#ffffff',
    fontSize: 16,
    lineHeight: 24,
  },
  botBubbleText: {
    color: '#4a257b',
    fontSize: 17,
    fontWeight: '500',
    lineHeight: 31,
  },
  inputRow: {
    marginTop: 8,
    marginHorizontal: 12,
    marginBottom: 24,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    backgroundColor: '#ece8f2',
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  input: {
    flex: 1,
    height: 40,
    paddingHorizontal: 6,
    color: '#393346',
    fontSize: 16,
  },
  sendButton: {
    height: 40,
    minWidth: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    backgroundColor: '#7a35d5',
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  sendButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
});