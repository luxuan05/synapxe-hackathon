import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import DateTimePicker, {
  DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { useFocusEffect } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChatbotDialog } from '@/components/chatbot-dialog';
import { API_BASE } from '@/constants/api';
import { useAuth } from '@/hooks/use-auth';

const MEDICAL_CONDITION_OPTIONS = [
  'Hypertension',
  'Diabetes',
  'Asthma',
  'High Cholesterol',
  'Heart Disease',
  'Kidney Disease',
  'Thyroid Disorder',
  'Others',
];
const MEDICATION_OPTIONS = ['Metformin', 'Lisinopril', 'Aspirin', 'Vitamin D', 'Atorvastatin', 'Others'];

const pad = (value: number) => String(value).padStart(2, '0');

const formatDateForApi = (date: Date) => {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

const formatDateForDisplay = (date: Date) => {
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
};

const parseStoredDate = (value?: string | null) => {
  if (!value) return null;

  // Handles YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day);
  }

  // Handles DD/MM/YYYY
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(value)) {
    const [day, month, year] = value.split('/').map(Number);
    return new Date(year, month - 1, day);
  }

  return null;
};

const splitCsv = (value?: string | null) => {
  if (!value) return [];
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
};

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { logout, user, token, needsProfileSetup, profileParticulars, completeProfileSetup } = useAuth();

  const [chatOpen, setChatOpen] = useState(false);
  const [showParticularsModal, setShowParticularsModal] = useState(false);
  const [showConditionsDropdown, setShowConditionsDropdown] = useState(false);
  const [showMedicationDropdown, setShowMedicationDropdown] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [isSavingParticulars, setIsSavingParticulars] = useState(false);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [totalPoints, setTotalPoints] = useState<number | null>(null);

  const initialDobDate = useMemo(
    () => parseStoredDate(profileParticulars?.dateOfBirth) ?? new Date(1991, 0, 1),
    [profileParticulars?.dateOfBirth]
  );

  const [dobDate, setDobDate] = useState<Date>(initialDobDate);
  const [showDobPicker, setShowDobPicker] = useState(false);

  const [phone, setPhone] = useState(profileParticulars?.phone ?? '');
  const [address, setAddress] = useState(profileParticulars?.address ?? '');
  const [emergencyContact, setEmergencyContact] = useState(profileParticulars?.emergencyContact ?? '');
  const [medicalConditions, setMedicalConditions] = useState<string[]>(
    profileParticulars?.medicalConditions ?? []
  );
  const [otherMedicalConditionInput, setOtherMedicalConditionInput] = useState('');
  const [selectedMedicationOptions, setSelectedMedicationOptions] = useState<string[]>([]);
  const [otherMedicationInput, setOtherMedicationInput] = useState('');

  const displayName = user?.name ?? 'Patient';
  const avatarText = displayName.trim().charAt(0).toUpperCase() || 'P';
  const patientCode = user?.id ? `#PH-${String(user.id).padStart(5, '0')}` : '#PH-00000';

  useEffect(() => {
    if (needsProfileSetup) {
      setShowParticularsModal(true);
    }
  }, [needsProfileSetup]);

  const loadRewards = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/patient/rewards`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = (await res.json()) as { total_points: number };
      setTotalPoints(data.total_points);
    } catch {
      // keep UI functional even if rewards fetch fails
    }
  }, [token]);

  useEffect(() => {
    void loadRewards();
  }, [loadRewards]);

  useFocusEffect(
    useCallback(() => {
      void loadRewards();
    }, [loadRewards])
  );

  useEffect(() => {
    if (!profileParticulars) return;

    const parsedDob = parseStoredDate(profileParticulars.dateOfBirth);
    if (parsedDob) {
      setDobDate(parsedDob);
    }

    setPhone(profileParticulars.phone ?? '');
    setAddress(profileParticulars.address ?? '');
    setEmergencyContact(profileParticulars.emergencyContact ?? '');
    const incomingConditions = profileParticulars.medicalConditions ?? [];
    const knownConditions = incomingConditions.filter((item) => MEDICAL_CONDITION_OPTIONS.includes(item) && item !== 'Others');
    const otherConditions = incomingConditions.filter((item) => !MEDICAL_CONDITION_OPTIONS.includes(item));
    setMedicalConditions(otherConditions.length > 0 ? [...knownConditions, 'Others'] : knownConditions);
    setOtherMedicalConditionInput(otherConditions.join(', '));

    const incomingMeds = splitCsv(profileParticulars.medicationList);
    const knownMeds = incomingMeds.filter((item) => MEDICATION_OPTIONS.includes(item) && item !== 'Others');
    const otherMeds = incomingMeds.filter((item) => !MEDICATION_OPTIONS.includes(item));
    setSelectedMedicationOptions(otherMeds.length > 0 ? [...knownMeds, 'Others'] : knownMeds);
    setOtherMedicationInput(otherMeds.join(', '));
  }, [profileParticulars]);

  const sections = [
    {
      label: 'Personal Information',
      detail:
        profileParticulars?.dateOfBirth && profileParticulars?.address
          ? `DOB: ${profileParticulars.dateOfBirth} · ${profileParticulars.address}`
          : 'Name, DOB, Address',
      icon: 'person-outline' as const,
    },
    {
      label: 'Emergency Contact',
      detail: profileParticulars?.emergencyContact ?? 'Add emergency contact',
      icon: 'phone' as const,
    },
    {
      label: 'Medical Conditions',
      detail:
        profileParticulars?.medicalConditions && profileParticulars.medicalConditions.length > 0
          ? profileParticulars.medicalConditions.join(', ')
          : 'Add your medical conditions',
      icon: 'favorite-border' as const,
    },
    {
      label: 'Medication List',
      detail: profileParticulars?.medicationList ?? 'Add your medication list',
      icon: 'medication' as const,
    },
    {
      label: 'Notification Settings',
      detail: profileParticulars?.phone ? `Phone: ${profileParticulars.phone}` : 'Reminders enabled',
      icon: 'notifications-none' as const,
    },
    {
      label: 'Rewards & Points',
      detail: totalPoints !== null ? `${totalPoints} points earned` : 'Loading points...',
      icon: 'card-giftcard' as const,
    },
  ];

  const toggleCondition = (condition: string) => {
    setMedicalConditions((current) =>
      current.includes(condition) ? current.filter((item) => item !== condition) : [...current, condition]
    );
  };

  const toggleMedicationOption = (option: string) => {
    setSelectedMedicationOptions((current) =>
      current.includes(option) ? current.filter((item) => item !== option) : [...current, option]
    );
  };

  const handleDobChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setShowDobPicker(false);
    }

    if (event.type === 'dismissed') return;
    if (selectedDate) {
      setDobDate(selectedDate);
    }
  };

  const handleSaveParticulars = async () => {
    const nonOtherConditions = medicalConditions.filter((item) => item !== 'Others');
    const otherConditions = splitCsv(otherMedicalConditionInput);
    const finalConditions = Array.from(new Set([...nonOtherConditions, ...otherConditions]));

    const nonOtherMeds = selectedMedicationOptions.filter((item) => item !== 'Others');
    const otherMeds = splitCsv(otherMedicationInput);
    const finalMedicationList = Array.from(new Set([...nonOtherMeds, ...otherMeds])).join(', ');

    if (
      !phone.trim() ||
      !address.trim() ||
      !emergencyContact.trim() ||
      finalConditions.length === 0 ||
      !finalMedicationList.trim()
    ) {
      setSetupError('Please fill in all required fields.');
      return;
    }

    setIsSavingParticulars(true);

    try {
      await completeProfileSetup({
        dateOfBirth: formatDateForApi(dobDate), // sends YYYY-MM-DD to backend
        phone: phone.trim(),
        address: address.trim(),
        emergencyContact: emergencyContact.trim(),
        medicalConditions: finalConditions,
        medicationList: finalMedicationList,
      });

      setSetupError(null);
      setShowConditionsDropdown(false);
      setShowMedicationDropdown(false);
      setShowParticularsModal(false);
      setIsEditingProfile(false);
    } catch (error) {
      setSetupError(error instanceof Error ? error.message : 'Failed to save particulars');
    } finally {
      setIsSavingParticulars(false);
    }
  };

  const handleOpenEditProfile = () => {
    setSetupError(null);
    setShowConditionsDropdown(false);
    setShowMedicationDropdown(false);
    setIsEditingProfile(true);
    setShowParticularsModal(true);
  };

  const handleCloseParticularsModal = () => {
    if (needsProfileSetup || isSavingParticulars) return;
    setShowParticularsModal(false);
    setShowConditionsDropdown(false);
    setShowMedicationDropdown(false);
    setSetupError(null);
    setIsEditingProfile(false);
  };

  return (
    <>
      <View style={styles.screen}>
        <View style={[styles.topHeader, { paddingTop: insets.top + 10 }]}>
          <Text style={styles.topTitle}>Profile</Text>
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
          <View style={styles.hero}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{avatarText}</Text>
            </View>

            <Text style={styles.name}>{displayName}</Text>
            <Text style={styles.patientId}>Patient ID: {patientCode}</Text>

            <Pressable style={styles.editButton} onPress={handleOpenEditProfile}>
              <MaterialIcons name="edit" size={15} color="#6f31c3" />
              <Text style={styles.editButtonText}>Edit Profile</Text>
            </Pressable>

            <Pressable style={styles.logoutButton} onPress={logout}>
              <MaterialIcons name="logout" size={16} color="#ffffff" />
              <Text style={styles.logoutButtonText}>Logout</Text>
            </Pressable>
          </View>

          {sections.map((section) => (
            <View key={section.label} style={styles.sectionCard}>
              <View style={styles.sectionIcon}>
                <MaterialIcons name={section.icon} size={20} color="#7a35d5" />
              </View>

              <View style={styles.sectionTextWrap}>
                <Text style={styles.sectionTitle}>{section.label}</Text>
                <Text style={styles.sectionDetail}>{section.detail}</Text>
              </View>

            </View>
          ))}
        </ScrollView>
      </View>

      <ChatbotDialog
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        patientId={user?.id ? String(user.id) : undefined}
      />

      <Modal visible={showParticularsModal} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{needsProfileSetup ? 'Complete Your Profile' : 'Edit Profile'}</Text>
            <Text style={styles.modalSubtitle}>
              {needsProfileSetup
                ? 'Please provide your particulars before continuing to use the app.'
                : 'Update your particulars and save your changes.'}
            </Text>

            <Pressable style={styles.dateButton} onPress={() => setShowDobPicker(true)}>
              <Text style={styles.dateButtonText}>{formatDateForDisplay(dobDate)}</Text>
              <MaterialIcons name="calendar-today" size={18} color="#6c6680" />
            </Pressable>

            {showDobPicker && Platform.OS === 'android' ? (
              <DateTimePicker
                value={dobDate}
                mode="date"
                display="default"
                maximumDate={new Date()}
                onChange={handleDobChange}
              />
            ) : null}

            {showDobPicker && Platform.OS === 'ios' ? (
              <Modal transparent animationType="slide" visible={showDobPicker}>
                <View style={styles.iosPickerOverlay}>
                  <View style={styles.iosPickerCard}>
                    <View style={styles.iosPickerHeader}>
                      <Pressable onPress={() => setShowDobPicker(false)}>
                        <Text style={styles.iosPickerAction}>Done</Text>
                      </Pressable>
                    </View>

                    <DateTimePicker
                      value={dobDate}
                      mode="date"
                      display="spinner"
                      maximumDate={new Date()}
                      onChange={handleDobChange}
                      style={styles.iosPicker}
                    />
                  </View>
                </View>
              </Modal>
            ) : null}

            <TextInput
              value={phone}
              onChangeText={setPhone}
              placeholder="Phone number"
              placeholderTextColor="#8d87a1"
              keyboardType="phone-pad"
              style={styles.modalInput}
            />

            <TextInput
              value={address}
              onChangeText={setAddress}
              placeholder="Home address"
              placeholderTextColor="#8d87a1"
              style={styles.modalInput}
            />

            <TextInput
              value={emergencyContact}
              onChangeText={setEmergencyContact}
              placeholder="Emergency contact"
              placeholderTextColor="#8d87a1"
              style={styles.modalInput}
            />

            <View>
              <Pressable style={styles.dropdownButton} onPress={() => setShowConditionsDropdown((prev) => !prev)}>
                <Text style={[styles.dropdownButtonText, medicalConditions.length === 0 && styles.dropdownPlaceholder]}>
                  {medicalConditions.length > 0
                    ? medicalConditions.join(', ')
                    : 'Medical conditions (select one or more)'}
                </Text>

                <MaterialIcons
                  name={showConditionsDropdown ? 'keyboard-arrow-up' : 'keyboard-arrow-down'}
                  size={22}
                  color="#6c6680"
                />
              </Pressable>

              {showConditionsDropdown ? (
                <View style={styles.dropdownMenu}>
                  {MEDICAL_CONDITION_OPTIONS.map((option) => {
                    const selected = medicalConditions.includes(option);

                    return (
                      <Pressable key={option} style={styles.dropdownItem} onPress={() => toggleCondition(option)}>
                        <MaterialIcons
                          name={selected ? 'check-box' : 'check-box-outline-blank'}
                          size={19}
                          color={selected ? '#7a35d5' : '#7b758c'}
                        />
                        <Text style={styles.dropdownItemText}>{option}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}
            </View>
            {medicalConditions.includes('Others') ? (
              <TextInput
                value={otherMedicalConditionInput}
                onChangeText={setOtherMedicalConditionInput}
                placeholder="Other medical condition(s), comma-separated"
                placeholderTextColor="#8d87a1"
                style={styles.modalInput}
              />
            ) : null}

            <View>
              <Pressable style={styles.dropdownButton} onPress={() => setShowMedicationDropdown((prev) => !prev)}>
                <Text
                  style={[
                    styles.dropdownButtonText,
                    selectedMedicationOptions.length === 0 && styles.dropdownPlaceholder,
                  ]}>
                  {selectedMedicationOptions.length > 0
                    ? selectedMedicationOptions.join(', ')
                    : 'Medication list (select one or more)'}
                </Text>
                <MaterialIcons
                  name={showMedicationDropdown ? 'keyboard-arrow-up' : 'keyboard-arrow-down'}
                  size={22}
                  color="#6c6680"
                />
              </Pressable>

              {showMedicationDropdown ? (
                <View style={styles.dropdownMenu}>
                  {MEDICATION_OPTIONS.map((option) => {
                    const selected = selectedMedicationOptions.includes(option);
                    return (
                      <Pressable key={option} style={styles.dropdownItem} onPress={() => toggleMedicationOption(option)}>
                        <MaterialIcons
                          name={selected ? 'check-box' : 'check-box-outline-blank'}
                          size={19}
                          color={selected ? '#7a35d5' : '#7b758c'}
                        />
                        <Text style={styles.dropdownItemText}>{option}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}
            </View>
            {selectedMedicationOptions.includes('Others') ? (
              <TextInput
                value={otherMedicationInput}
                onChangeText={setOtherMedicationInput}
                placeholder="Other medication(s), comma-separated"
                placeholderTextColor="#8d87a1"
                style={styles.modalInput}
              />
            ) : null}

            {setupError ? <Text style={styles.modalError}>{setupError}</Text> : null}

            <View style={styles.modalActionRow}>
              {!needsProfileSetup ? (
                <Pressable
                  style={[styles.modalSecondaryButton, isSavingParticulars && styles.modalButtonDisabled]}
                  onPress={handleCloseParticularsModal}
                  disabled={isSavingParticulars}
                >
                  <Text style={styles.modalSecondaryButtonText}>Cancel</Text>
                </Pressable>
              ) : null}
              <Pressable
                style={[styles.modalButton, isSavingParticulars && styles.modalButtonDisabled]}
                onPress={handleSaveParticulars}
                disabled={isSavingParticulars}
              >
                <Text style={styles.modalButtonText}>
                  {isSavingParticulars ? 'Saving...' : needsProfileSetup ? 'Save particulars' : 'Save changes'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
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
  hero: {
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
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ece5f7',
  },
  avatar: {
    width: 98,
    height: 98,
    borderRadius: 49,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#7a35d5',
    marginBottom: 8,
    shadowColor: '#54258f',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  avatarText: {
    color: '#fff',
    fontSize: 45,
    fontWeight: '700',
  },
  name: {
    color: '#1f1a29',
    fontSize: 23,
    fontWeight: '700',
  },
  patientId: {
    color: '#5f596e',
    fontSize: 18,
    marginTop: 2,
  },
  editButton: {
    marginTop: 12,
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 10,
    backgroundColor: '#e7dcf5',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  editButtonText: {
    color: '#6f31c3',
    fontSize: 18,
    fontWeight: '700',
  },
  logoutButton: {
    marginTop: 10,
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 10,
    backgroundColor: '#7a35d5',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  logoutButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  sectionCard: {
    borderRadius: 18,
    backgroundColor: '#fff',
    paddingVertical: 16,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    shadowColor: '#29173e',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  sectionIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#f1ebfb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTextWrap: {
    flex: 1,
  },
  sectionTitle: {
    color: '#1f1a29',
    fontSize: 18,
    fontWeight: '700',
  },
  sectionDetail: {
    color: '#666073',
    fontSize: 14,
    marginTop: 2,
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
  dateButton: {
    borderWidth: 1,
    borderColor: '#dfd8ee',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dateButtonText: {
    fontSize: 15,
    color: '#1f1a2b',
  },
  dropdownButton: {
    borderWidth: 1,
    borderColor: '#dfd8ee',
    borderRadius: 12,
    backgroundColor: '#fff',
    paddingHorizontal: 14,
    paddingVertical: 11,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  dropdownButtonText: {
    flex: 1,
    color: '#1f1a2b',
    fontSize: 15,
  },
  dropdownPlaceholder: {
    color: '#8d87a1',
  },
  dropdownMenu: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#e3d9f6',
    borderRadius: 12,
    backgroundColor: '#faf7ff',
    paddingVertical: 6,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  dropdownItemText: {
    color: '#2a2238',
    fontSize: 14,
  },
  modalError: {
    color: '#cc335f',
    fontSize: 13,
    marginTop: 2,
  },
  modalButton: {
    borderRadius: 12,
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#7a35d5',
    flex: 1,
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
  modalButtonDisabled: {
    opacity: 0.7,
  },
  modalButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  iosPickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(24, 17, 38, 0.35)',
    justifyContent: 'flex-end',
  },
  iosPickerCard: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingBottom: 24,
  },
  iosPickerHeader: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    alignItems: 'flex-end',
    borderBottomWidth: 1,
    borderBottomColor: '#ece7f7',
  },
  iosPickerAction: {
    color: '#7a35d5',
    fontSize: 16,
    fontWeight: '700',
  },
  iosPicker: {
    alignSelf: 'center',
  },
});
