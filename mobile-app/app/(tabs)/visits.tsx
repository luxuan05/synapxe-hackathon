import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChatbotDialog } from '@/components/chatbot-dialog';
import { useAuth } from '@/hooks/use-auth';

type Summary = {
  id: number;
  date: string;
  doctorName: string;
  clinic: string;
  summaryText: string;
};

type Language = { code: string; label: string; nativeLabel: string };

const LANGUAGES: Language[] = [
  { code: 'en', label: 'English', nativeLabel: 'English' },
  { code: 'zh', label: 'Chinese', nativeLabel: '中文' },
  { code: 'ms', label: 'Malay', nativeLabel: 'Bahasa Melayu' },
  { code: 'ta', label: 'Tamil', nativeLabel: 'தமிழ்' },
];

const API_BASE =
  process.env.EXPO_PUBLIC_API_BASE_URL ??
  (Platform.OS === 'android' ? 'http://10.0.2.2:8000' : 'http://127.0.0.1:8000');

export default function VisitsScreen() {
  const insets = useSafeAreaInsets();
  const [chatOpen, setChatOpen] = useState(false);
  const { user, token } = useAuth();
  const [summaries, setSummaries] = useState<Summary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedLang, setSelectedLang] = useState<Record<number, string>>({});
  const [translatedText, setTranslatedText] = useState<Record<string, string>>({});
  const [translating, setTranslating] = useState<Record<string, boolean>>({});

  // Modal picker state
  const [pickerOpen, setPickerOpen] = useState<number | null>(null);

  useEffect(() => {
    if (!token) return;
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${API_BASE}/patient/summaries`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.detail ?? 'Failed to load visit summaries');
        }
        const data = (await res.json()) as Array<{
          id: number;
          date: string;
          doctor_name: string;
          clinic: string;
          summary_text: string;
        }>;
        setSummaries(
          data.map((item) => ({
            id: item.id,
            date: item.date,
            doctorName: `Dr. ${item.doctor_name}`,
            clinic: item.clinic,
            summaryText: item.summary_text,
          }))
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load visit summaries');
      } finally {
        setLoading(false);
      }
    };
    void run();
  }, [token]);

  const handleSelectLanguage = async (summaryId: number, langCode: string, originalText: string) => {
    setPickerOpen(null);
    setSelectedLang((prev) => ({ ...prev, [summaryId]: langCode }));
    if (langCode === 'en') return;

    const cacheKey = `${summaryId}-${langCode}`;
    if (translatedText[cacheKey]) return;

    setTranslating((prev) => ({ ...prev, [cacheKey]: true }));
    try {
      const res = await fetch(`${API_BASE}/patient/translate-summary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ text: originalText, target_language: langCode }),
      });
      if (!res.ok) throw new Error('Translation failed');
      const data = (await res.json()) as { translated_text: string };
      setTranslatedText((prev) => ({ ...prev, [cacheKey]: data.translated_text }));
    } catch {
      setSelectedLang((prev) => ({ ...prev, [summaryId]: 'en' }));
    } finally {
      setTranslating((prev) => ({ ...prev, [cacheKey]: false }));
    }
  };

  const getDisplayText = (summary: Summary) => {
    const lang = selectedLang[summary.id] ?? 'en';
    if (lang === 'en') return summary.summaryText;
    return translatedText[`${summary.id}-${lang}`] ?? summary.summaryText;
  };

  const isTranslating = (summaryId: number) => {
    const lang = selectedLang[summaryId] ?? 'en';
    if (lang === 'en') return false;
    return translating[`${summaryId}-${lang}`] ?? false;
  };

  const activeSummary = summaries.find((s) => s.id === pickerOpen);

  return (
    <>
      <View style={styles.screen}>
        <View style={[styles.topHeader, { paddingTop: insets.top + 10 }]}>
          <Text style={styles.topTitle}>Summaries</Text>
          <Pressable style={styles.chatButton} onPress={() => setChatOpen(true)}>
            <MaterialIcons name="chat-bubble-outline" size={16} color="#efe6ff" />
            <Text style={styles.chatButtonText}>Chat</Text>
          </Pressable>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.container, { paddingTop: insets.top + 92, paddingBottom: 120 }]}
          showsVerticalScrollIndicator={false}>
          <View style={styles.heroCard}>
            <Text style={styles.heroTitle}>Visit Summaries</Text>
            <Text style={styles.heroSubtitle}>Your simplified appointment notes</Text>
          </View>

          {loading ? (
            <View style={styles.stateCard}>
              <ActivityIndicator size="small" color="#7a35d5" />
              <Text style={styles.stateText}>Loading summaries...</Text>
            </View>
          ) : error ? (
            <View style={styles.stateCard}>
              <Text style={styles.stateErrorText}>{error}</Text>
            </View>
          ) : summaries.length === 0 ? (
            <View style={styles.stateCard}>
              <Text style={styles.stateText}>No doctor summaries available yet.</Text>
            </View>
          ) : (
            summaries.map((item) => {
              const currentLang = selectedLang[item.id] ?? 'en';
              const currentLangObj = LANGUAGES.find((l) => l.code === currentLang) ?? LANGUAGES[0];

              return (
                <View key={item.id} style={styles.card}>
                  {/* Header row */}
                  <View style={styles.cardHeader}>
                    <View style={styles.doctorRow}>
                      <View style={styles.doctorIconWrap}>
                        <MaterialIcons name="medical-services" size={20} color="#7a35d5" />
                      </View>
                      <View>
                        <Text style={styles.doctorName}>{item.doctorName}</Text>
                        <Text style={styles.clinicText}>{item.clinic}</Text>
                        <View style={styles.dateRow}>
                          <MaterialIcons name="calendar-month" size={13} color="#9b8fb0" />
                          <Text style={styles.dateText}>{new Date(item.date).toLocaleDateString('en-SG')}</Text>
                        </View>
                      </View>
                    </View>

                    {/* Translate button */}
                    <TouchableOpacity
                      style={styles.translateBtn}
                      onPress={() => setPickerOpen(item.id)}
                      activeOpacity={0.7}
                    >
                      <MaterialIcons name="translate" size={15} color="#7a35d5" />
                      <Text style={styles.translateBtnText}>{currentLangObj.nativeLabel}</Text>
                      <MaterialIcons name="keyboard-arrow-down" size={15} color="#7a35d5" />
                    </TouchableOpacity>
                  </View>

                  {/* Divider */}
                  <View style={styles.divider} />

                  {/* Summary text */}
                  {isTranslating(item.id) ? (
                    <View style={styles.translatingRow}>
                      <ActivityIndicator size="small" color="#7a35d5" />
                      <Text style={styles.translatingText}>Translating to {currentLangObj.label}...</Text>
                    </View>
                  ) : (
                    <Text style={styles.summaryText}>{getDisplayText(item)}</Text>
                  )}

                  {currentLang !== 'en' && !isTranslating(item.id) && (
                    <Text style={styles.translatedNote}>
                      AI translated · {currentLangObj.label}
                    </Text>
                  )}
                </View>
              );
            })
          )}
        </ScrollView>
      </View>

      {/* Language picker modal */}
      <Modal
        visible={pickerOpen !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setPickerOpen(null)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setPickerOpen(null)}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Choose Language</Text>
            <Text style={styles.modalSubtitle}>Summary will be translated using AI</Text>
            <View style={styles.langList}>
              {LANGUAGES.map((lang) => {
                const isActive = (selectedLang[pickerOpen!] ?? 'en') === lang.code;
                return (
                  <TouchableOpacity
                    key={lang.code}
                    style={[styles.langItem, isActive && styles.langItemActive]}
                    onPress={() =>
                      activeSummary && handleSelectLanguage(activeSummary.id, lang.code, activeSummary.summaryText)
                    }
                    activeOpacity={0.7}
                  >
                    <View style={styles.langItemLeft}>
                      <Text style={[styles.langNative, isActive && styles.langNativeActive]}>
                        {lang.nativeLabel}
                      </Text>
                      <Text style={styles.langEnglish}>{lang.label}</Text>
                    </View>
                    {isActive && (
                      <MaterialIcons name="check-circle" size={20} color="#7a35d5" />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </Pressable>
      </Modal>

      <ChatbotDialog
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        patientId={user?.id ? String(user.id) : undefined}
      />
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f4f2f8' },
  topHeader: {
    position: 'absolute', left: 0, right: 0, zIndex: 20,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 24, paddingBottom: 12,
    backgroundColor: '#7a35d5',
    shadowColor: '#2d1b4b', shadowOpacity: 0.2, shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 }, elevation: 6,
  },
  topTitle: { color: '#f3ebff', fontSize: 34, fontWeight: '700' },
  chatButton: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderRadius: 14, paddingHorizontal: 13, paddingVertical: 9,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  chatButtonText: { color: '#f3ebff', fontSize: 16, fontWeight: '600' },
  scroll: { flex: 1 },
  container: { paddingHorizontal: 16, gap: 12 },
  heroCard: {
    marginHorizontal: -16, marginTop: -28, marginBottom: 8,
    borderBottomLeftRadius: 30, borderBottomRightRadius: 30,
    paddingHorizontal: 28, paddingTop: 22, paddingBottom: 20,
    backgroundColor: '#ece5f7',
  },
  heroTitle: { color: '#171126', fontSize: 24, fontWeight: '700', lineHeight: 30 },
  heroSubtitle: { color: '#6f687c', fontSize: 17, marginTop: 4 },

  card: {
    borderRadius: 18, backgroundColor: '#fff', padding: 16,
    shadowColor: '#29173e', shadowOpacity: 0.06, shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'flex-start', marginBottom: 12,
  },
  doctorRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, flex: 1 },
  doctorIconWrap: {
    height: 40, width: 40, borderRadius: 12,
    backgroundColor: '#f1ebfb', alignItems: 'center', justifyContent: 'center',
  },
  doctorName: { color: '#1f1a29', fontSize: 17, fontWeight: '700' },
  clinicText: { color: '#666073', fontSize: 13, marginTop: 1 },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 3 },
  dateText: { color: '#9b8fb0', fontSize: 12 },

  translateBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#f1ebfb', borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 6,
    borderWidth: 1, borderColor: '#ddd0f5',
  },
  translateBtnText: { color: '#7a35d5', fontSize: 12, fontWeight: '600' },

  divider: { height: 1, backgroundColor: '#f0ecf8', marginBottom: 12 },

  summaryText: { color: '#35303f', fontSize: 16, lineHeight: 26 },
  translatingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12 },
  translatingText: { color: '#7a35d5', fontSize: 14 },
  translatedNote: { color: '#b0a5c4', fontSize: 11, fontStyle: 'italic', marginTop: 8 },

  stateCard: {
    borderRadius: 18, backgroundColor: '#fff',
    paddingVertical: 18, paddingHorizontal: 16,
    gap: 8, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#29173e', shadowOpacity: 0.05, shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 }, elevation: 1,
  },
  stateText: { color: '#666073', fontSize: 15 },
  stateErrorText: { color: '#c12f57', fontSize: 14, textAlign: 'center' },

  // Modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(20,10,40,0.45)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 40,
  },
  modalHandle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: '#ddd0f5', alignSelf: 'center', marginBottom: 20,
  },
  modalTitle: { fontSize: 20, fontWeight: '700', color: '#1f1a29', marginBottom: 4 },
  modalSubtitle: { fontSize: 13, color: '#9b8fb0', marginBottom: 20 },
  langList: { gap: 8 },
  langItem: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    borderRadius: 14, backgroundColor: '#faf8ff',
    borderWidth: 1.5, borderColor: '#f0ecf8',
  },
  langItemActive: { backgroundColor: '#f1ebfb', borderColor: '#c4a8f0' },
  langItemLeft: { gap: 2 },
  langNative: { fontSize: 16, fontWeight: '700', color: '#1f1a29' },
  langNativeActive: { color: '#7a35d5' },
  langEnglish: { fontSize: 12, color: '#9b8fb0' },
});
