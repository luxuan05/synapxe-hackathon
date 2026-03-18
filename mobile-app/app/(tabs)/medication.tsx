import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChatbotDialog } from '@/components/chatbot-dialog';
import { API_BASE } from '@/constants/api';
import { useAuth } from '@/hooks/use-auth';

type Med = {
  id: number;
  name: string;
  dosage: string;
  schedule_time: string;
  taken: boolean;
  missed: boolean;
};

type RewardsPayload = {
  points_earned: number;
  total_points: number;
};

const QUICK_MEDICATION_OPTIONS = ['Metformin', 'Lisinopril', 'Aspirin', 'Vitamin D', 'Atorvastatin', 'Others'];
const TIME_OPTIONS = Array.from({ length: 48 }, (_, idx) => {
  const hour = Math.floor(idx / 2);
  const minute = idx % 2 === 0 ? '00' : '30';
  return `${String(hour).padStart(2, '0')}:${minute}`;
});
const VOUCHERS = [
  { id: 'v1', title: '$5 Health Voucher', points: 100 },
  { id: 'v2', title: '$10 Pharmacy Voucher', points: 200 },
  { id: 'v3', title: '$20 Wellness Voucher', points: 350 },
];
export default function MedicationScreen() {
  const insets = useSafeAreaInsets();
  const { user, token, refreshProfile } = useAuth();

  const [chatOpen, setChatOpen] = useState(false);
  const [meds, setMeds] = useState<Med[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [rewards, setRewards] = useState<RewardsPayload | null>(null);

  const [showMedicationModal, setShowMedicationModal] = useState(false);
  const [editingMedId, setEditingMedId] = useState<number | null>(null);
  const [selectedQuickName, setSelectedQuickName] = useState<string>('Metformin');
  const [customName, setCustomName] = useState('');
  const [dosage, setDosage] = useState('');
  const [scheduleTime, setScheduleTime] = useState('08:00');
  const [showTimePickerDropdown, setShowTimePickerDropdown] = useState(false);
  const [redeemedVoucherIds, setRedeemedVoucherIds] = useState<string[]>([]);

  const takenCount = useMemo(() => meds.filter((m) => m.taken).length, [meds]);
  const points = rewards?.points_earned ?? takenCount * 5;
  const totalPoints = rewards?.total_points ?? points;
  const availablePoints =
    totalPoints -
    VOUCHERS.filter((voucher) => redeemedVoucherIds.includes(voucher.id)).reduce(
      (sum, voucher) => sum + voucher.points,
      0
    );

  const loadMeds = async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/patient/medications`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail ?? 'Failed to load medications');
      }
      setMeds((await res.json()) as Med[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load medications');
    } finally {
      setLoading(false);
    }
  };

  const loadRewards = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/patient/rewards`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      setRewards((await res.json()) as RewardsPayload);
    } catch {
      // Keep medication screen usable even if rewards endpoint fails.
    }
  };

  useEffect(() => {
    void loadMeds();
    void loadRewards();
  }, [token]);

  const resetModal = () => {
    setEditingMedId(null);
    setSelectedQuickName('Metformin');
    setCustomName('');
    setDosage('');
    setScheduleTime('08:00');
    setShowTimePickerDropdown(false);
  };

  const openAddModal = () => {
    resetModal();
    setShowMedicationModal(true);
  };

  const openEditModal = (med: Med) => {
    setEditingMedId(med.id);
    if (QUICK_MEDICATION_OPTIONS.includes(med.name)) {
      setSelectedQuickName(med.name);
      setCustomName('');
    } else {
      setSelectedQuickName('Others');
      setCustomName(med.name);
    }
    setDosage(med.dosage);
    setScheduleTime(med.schedule_time);
    setShowMedicationModal(true);
  };

  const closeModal = () => {
    if (saving) return;
    setShowMedicationModal(false);
    resetModal();
  };

  const redeemVoucher = (voucherId: string, cost: number) => {
    if (redeemedVoucherIds.includes(voucherId)) return;
    if (availablePoints < cost) return;
    setRedeemedVoucherIds((prev) => [...prev, voucherId]);
  };

  const resolvedMedicationName = selectedQuickName === 'Others' ? customName.trim() : selectedQuickName;

  const handleSaveMedication = async () => {
    if (!token) return;
    if (!resolvedMedicationName) {
      setError('Please enter medication name.');
      return;
    }
    if (!scheduleTime.trim()) {
      setError('Please set reminder timing.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const endpoint = editingMedId ? `/patient/medications/${editingMedId}` : '/patient/medications';
      const method = editingMedId ? 'PUT' : 'POST';
      const res = await fetch(`${API_BASE}${endpoint}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: resolvedMedicationName,
          dosage: dosage.trim(),
          schedule_time: scheduleTime.trim(),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail ?? 'Failed to save medication');
      }
      await loadMeds();
      await loadRewards();
      await refreshProfile();
      closeModal();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save medication');
    } finally {
      setSaving(false);
    }
  };

  const markTaken = async (id: number, taken: boolean) => {
    if (!token) return;
    setMeds((prev) => prev.map((m) => (m.id === id ? { ...m, taken } : m)));
    try {
      const res = await fetch(`${API_BASE}/patient/medications/${id}/taken`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ taken }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail ?? 'Failed to update medication status');
      }
      await loadRewards();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update medication status');
      await loadMeds();
      await loadRewards();
    }
  };

  return (
    <>
      <View style={styles.screen}>
        <View style={[styles.topHeader, { paddingTop: insets.top + 10 }]}>
          <Text style={styles.topTitle}>Medications</Text>
          <Pressable style={styles.chatButton} onPress={() => setChatOpen(true)}>
            <MaterialIcons name="chat-bubble-outline" size={16} color="#efe6ff" />
            <Text style={styles.chatButtonText}>Chat</Text>
          </Pressable>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.container, { paddingTop: insets.top + 92, paddingBottom: 120 }]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.heroCard}>
            <Text style={styles.heroTitle}>Medication Tracker</Text>
            <Text style={styles.heroSubtitle}>Stay on top of your health</Text>
            <Pressable style={styles.addMedicationButton} onPress={openAddModal}>
              <MaterialIcons name="add" size={16} color="#fff" />
              <Text style={styles.addMedicationButtonText}>Add Medication</Text>
            </Pressable>
          </View>

          {loading ? (
            <View style={styles.stateCard}>
              <ActivityIndicator size="small" color="#7a35d5" />
              <Text style={styles.stateText}>Loading medications...</Text>
            </View>
          ) : meds.length === 0 ? (
            <View style={styles.stateCard}>
              <Text style={styles.stateText}>No medications yet. Add your first one.</Text>
            </View>
          ) : (
            meds.map((med) => (
              <View key={med.id} style={styles.medCard}>
                <View style={styles.medInfo}>
                  <Text style={styles.medName}>{med.name}</Text>
                  <Text style={styles.medMeta}>
                    {med.dosage ? `${med.dosage} · ` : ''}Reminder {med.schedule_time}
                  </Text>
                </View>

                <View style={styles.actionRow}>
                  <Pressable
                    style={[styles.actionBtn, med.taken ? styles.takeBtnTaken : styles.takeBtnPending]}
                    onPress={() => markTaken(med.id, true)}
                  >
                    <MaterialIcons name="check" size={16} color="#fff" />
                    <Text style={styles.actionBtnText}>{med.taken ? 'Taken' : 'Not Taken'}</Text>
                  </Pressable>
                  <Pressable style={[styles.actionBtn, styles.skipBtn]} onPress={() => markTaken(med.id, false)}>
                    <MaterialIcons name="alarm" size={16} color="#6d6879" />
                    <Text style={styles.skipBtnText}>Skip</Text>
                  </Pressable>
                  <Pressable style={[styles.actionBtn, styles.editBtn]} onPress={() => openEditModal(med)}>
                    <MaterialIcons name="edit" size={16} color="#5f2aa6" />
                    <Text style={styles.editBtnText}>Reminder</Text>
                  </Pressable>
                </View>
              </View>
            ))
          )}

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <View style={styles.progressCard}>
            <View style={styles.progressHeading}>
              <MaterialIcons name="emoji-events" size={20} color="#7a35d5" />
              <Text style={styles.progressTitle}>Your Progress</Text>
            </View>

            <View style={styles.pointsCard}>
              <Text style={styles.pointsLabel}>Points today</Text>
              <Text style={styles.pointsValue}>{points} pts</Text>
            </View>

            <Text style={styles.rewardText}>{totalPoints}/100 points - Keep logging your medications daily.</Text>
            <Text style={styles.availablePointsText}>Available points: {availablePoints}</Text>
            <View style={styles.voucherList}>
              {VOUCHERS.map((voucher) => {
                const redeemed = redeemedVoucherIds.includes(voucher.id);
                const canRedeem = !redeemed && availablePoints >= voucher.points;
                return (
                  <View key={voucher.id} style={styles.voucherItem}>
                    <View style={styles.voucherTextWrap}>
                      <Text style={styles.voucherTitle}>{voucher.title}</Text>
                      <Text style={styles.voucherCost}>{voucher.points} pts</Text>
                    </View>
                    <Pressable
                      style={[
                        styles.redeemButton,
                        redeemed && styles.redeemButtonDisabled,
                        !redeemed && !canRedeem && styles.redeemButtonDisabled,
                      ]}
                      disabled={!canRedeem}
                      onPress={() => redeemVoucher(voucher.id, voucher.points)}
                    >
                      <Text style={styles.redeemButtonText}>{redeemed ? 'Redeemed' : 'Redeem'}</Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>
          </View>
        </ScrollView>
      </View>

      <Modal visible={showMedicationModal} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{editingMedId ? 'Edit Medication' : 'Add Medication'}</Text>
            <Text style={styles.modalSubtitle}>
              Select a common medication or choose Others to enter your own.
            </Text>

            <View style={styles.quickOptionsRow}>
              {QUICK_MEDICATION_OPTIONS.map((option) => (
                <Pressable
                  key={option}
                  style={[styles.quickOption, selectedQuickName === option && styles.quickOptionSelected]}
                  onPress={() => setSelectedQuickName(option)}
                >
                  <Text style={[styles.quickOptionText, selectedQuickName === option && styles.quickOptionTextSelected]}>
                    {option}
                  </Text>
                </Pressable>
              ))}
            </View>

            {selectedQuickName === 'Others' ? (
              <TextInput
                value={customName}
                onChangeText={setCustomName}
                placeholder="Enter medication name"
                placeholderTextColor="#8d87a1"
                style={styles.modalInput}
              />
            ) : null}

            <TextInput
              value={dosage}
              onChangeText={setDosage}
              placeholder="Dosage (optional)"
              placeholderTextColor="#8d87a1"
              style={styles.modalInput}
            />

            <Pressable style={styles.timePickerButton} onPress={() => setShowTimePickerDropdown((prev) => !prev)}>
              <Text style={styles.timePickerButtonText}>Reminder: {scheduleTime}</Text>
              <MaterialIcons name={showTimePickerDropdown ? 'keyboard-arrow-up' : 'keyboard-arrow-down'} size={20} color="#6c6680" />
            </Pressable>
            {showTimePickerDropdown ? (
              <View style={styles.timePickerDropdown}>
                <ScrollView style={styles.timeOptionsList} nestedScrollEnabled>
                  {TIME_OPTIONS.map((option) => (
                    <Pressable
                      key={option}
                      style={[styles.timeOptionItem, scheduleTime === option && styles.timeOptionItemSelected]}
                      onPress={() => {
                        setScheduleTime(option);
                        setShowTimePickerDropdown(false);
                      }}
                    >
                      <Text style={[styles.timeOptionText, scheduleTime === option && styles.timeOptionTextSelected]}>
                        {option}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            ) : null}

            <View style={styles.modalActionRow}>
              <Pressable style={styles.modalSecondaryButton} onPress={closeModal} disabled={saving}>
                <Text style={styles.modalSecondaryButtonText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.modalButton, saving && styles.modalButtonDisabled]}
                onPress={handleSaveMedication}
                disabled={saving}
              >
                <Text style={styles.modalButtonText}>{saving ? 'Saving...' : 'Save'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <ChatbotDialog open={chatOpen} onClose={() => setChatOpen(false)} patientId={user?.id ? String(user.id) : undefined} />
    </>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#f4f2f8',
  },
  topHeader: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingBottom: 12,
    backgroundColor: '#7a35d5',
    shadowColor: '#2d1b4b',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 6,
  },
  topTitle: {
    color: '#f3ebff',
    fontSize: 34,
    fontWeight: '700',
  },
  chatButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 14,
    paddingHorizontal: 13,
    paddingVertical: 9,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  chatButtonText: {
    color: '#f3ebff',
    fontSize: 16,
    fontWeight: '600',
  },
  scroll: {
    flex: 1,
  },
  container: {
    paddingHorizontal: 16,
    gap: 12,
  },
  heroCard: {
    marginHorizontal: -16,
    marginTop: -28,
    marginBottom: 8,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
    paddingHorizontal: 28,
    paddingTop: 22,
    paddingBottom: 20,
    backgroundColor: '#ece5f7',
    gap: 8,
  },
  heroTitle: {
    color: '#171126',
    fontSize: 24,
    fontWeight: '700',
    lineHeight: 30,
  },
  heroSubtitle: {
    color: '#6f687c',
    fontSize: 17,
  },
  addMedicationButton: {
    alignSelf: 'flex-start',
    marginTop: 4,
    borderRadius: 12,
    backgroundColor: '#7a35d5',
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  addMedicationButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  stateCard: {
    borderRadius: 18,
    backgroundColor: '#fff',
    paddingVertical: 16,
    paddingHorizontal: 14,
    alignItems: 'center',
    gap: 8,
  },
  stateText: {
    color: '#666073',
    fontSize: 14,
  },
  medCard: {
    borderRadius: 18,
    backgroundColor: '#fff',
    padding: 16,
    gap: 12,
  },
  medInfo: {
    flex: 1,
  },
  medName: {
    color: '#1f1a29',
    fontSize: 20,
    fontWeight: '700',
  },
  medMeta: {
    color: '#666073',
    fontSize: 14,
    marginTop: 2,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  actionBtn: {
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  takeBtnTaken: {
    backgroundColor: '#28c76f',
  },
  takeBtnPending: {
    backgroundColor: '#d84b68',
  },
  skipBtn: {
    backgroundColor: '#efedf4',
  },
  editBtn: {
    backgroundColor: '#ece5f7',
  },
  actionBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  skipBtnText: {
    color: '#6d6879',
    fontWeight: '600',
    fontSize: 14,
  },
  editBtnText: {
    color: '#5f2aa6',
    fontWeight: '700',
    fontSize: 14,
  },
  progressCard: {
    borderRadius: 18,
    backgroundColor: '#fff',
    padding: 16,
    gap: 12,
  },
  progressHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  progressTitle: {
    color: '#1f1a29',
    fontSize: 17,
    fontWeight: '700',
  },
  pointsCard: {
    backgroundColor: '#ece5f7',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pointsLabel: {
    color: '#6f31c3',
    fontSize: 15,
  },
  pointsValue: {
    color: '#6f31c3',
    fontSize: 21,
    fontWeight: '700',
  },
  rewardText: {
    color: '#666073',
    fontSize: 14,
  },
  availablePointsText: {
    color: '#5d5670',
    fontSize: 13,
    fontWeight: '600',
  },
  voucherList: {
    gap: 8,
  },
  voucherItem: {
    borderRadius: 12,
    backgroundColor: '#f4eefb',
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  voucherTextWrap: {
    gap: 2,
  },
  voucherTitle: {
    color: '#2a2238',
    fontSize: 14,
    fontWeight: '700',
  },
  voucherCost: {
    color: '#6f687c',
    fontSize: 12,
  },
  redeemButton: {
    borderRadius: 10,
    backgroundColor: '#7a35d5',
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  redeemButtonDisabled: {
    opacity: 0.45,
  },
  redeemButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  errorText: {
    color: '#c12f57',
    fontSize: 13,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(24, 17, 38, 0.45)',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  modalCard: {
    borderRadius: 20,
    backgroundColor: '#fff',
    padding: 20,
    gap: 10,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1f1a2b',
  },
  modalSubtitle: {
    color: '#6c6680',
    fontSize: 14,
    marginBottom: 6,
  },
  quickOptionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  quickOption: {
    borderWidth: 1,
    borderColor: '#d9d0ec',
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#faf7ff',
  },
  quickOptionSelected: {
    backgroundColor: '#ece5f7',
    borderColor: '#7a35d5',
  },
  quickOptionText: {
    color: '#5f596e',
    fontSize: 13,
    fontWeight: '600',
  },
  quickOptionTextSelected: {
    color: '#6f31c3',
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#dfd8ee',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
    color: '#1f1a2b',
    backgroundColor: '#fff',
  },
  timePickerButton: {
    borderWidth: 1,
    borderColor: '#dfd8ee',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  timePickerButtonText: {
    color: '#1f1a2b',
    fontSize: 15,
  },
  timePickerDropdown: {
    borderWidth: 1,
    borderColor: '#dfd8ee',
    borderRadius: 12,
    backgroundColor: '#fff',
    maxHeight: 220,
  },
  timePickerCard: {
    borderRadius: 20,
    backgroundColor: '#fff',
    padding: 20,
    maxHeight: '70%',
    gap: 10,
  },
  timeOptionsList: {
    maxHeight: 300,
  },
  timeOptionItem: {
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 10,
  },
  timeOptionItemSelected: {
    backgroundColor: '#ece5f7',
  },
  timeOptionText: {
    color: '#3a3347',
    fontSize: 15,
  },
  timeOptionTextSelected: {
    color: '#6f31c3',
    fontWeight: '700',
  },
  modalActionRow: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  modalSecondaryButton: {
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#d5cce7',
    backgroundColor: '#f8f6fc',
    minWidth: 110,
  },
  modalSecondaryButtonText: {
    color: '#6a6380',
    fontSize: 15,
    fontWeight: '700',
  },
  modalButton: {
    borderRadius: 12,
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#7a35d5',
    flex: 1,
  },
  modalButtonDisabled: {
    opacity: 0.7,
  },
  modalButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
});
