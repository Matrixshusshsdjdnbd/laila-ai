import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator,
  Alert, Platform, SafeAreaView, Modal, TextInput, KeyboardAvoidingView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

const COLORS = {
  bg: '#0A0908', card: '#141311', primary: '#FFC107', primaryDark: '#422006',
  muted: '#27272A', mutedFg: '#A1A1AA', white: '#FFFFFF', text: '#E4E4E7',
  recording: '#EF4444',
};

const PROJECT_COLORS = ['#FFC107', '#3B82F6', '#10B981', '#A855F7', '#EF4444', '#F59E0B', '#EC4899', '#06B6D4'];

type Project = {
  id: string;
  name: string;
  description?: string;
  color: string;
  chat_count: number;
  created_at: string;
  updated_at: string;
};

export default function ProjectsScreen() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [color, setColor] = useState(PROJECT_COLORS[0]);
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  const getHeaders = async () => {
    const token = await AsyncStorage.getItem('laila_auth_token');
    return token
      ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
      : { 'Content-Type': 'application/json' };
  };

  const getDeviceId = async () => {
    let id = await AsyncStorage.getItem('laila_device_id');
    if (!id) { id = 'device-' + Math.random().toString(36).slice(2, 10); await AsyncStorage.setItem('laila_device_id', id); }
    return id;
  };

  const load = async () => {
    try {
      setLoading(true);
      const h = await getHeaders();
      const dev = await getDeviceId();
      const res = await fetch(`${BACKEND_URL}/api/projects?device_id=${dev}`, { headers: h });
      if (res.ok) { const d = await res.json(); setProjects(d.projects || []); }
    } catch {} finally { setLoading(false); }
  };

  useFocusEffect(useCallback(() => { load(); }, []));

  const openCreate = () => {
    setEditId(null); setName(''); setDesc(''); setColor(PROJECT_COLORS[0]); setModalOpen(true);
  };
  const openEdit = (p: Project) => {
    setEditId(p.id); setName(p.name); setDesc(p.description || ''); setColor(p.color); setModalOpen(true);
  };

  const save = async () => {
    if (!name.trim()) { Alert.alert('Missing name', 'Give your project a name.'); return; }
    try {
      setSaving(true);
      const h = await getHeaders();
      const dev = await getDeviceId();
      const url = editId
        ? `${BACKEND_URL}/api/projects/${editId}?device_id=${dev}`
        : `${BACKEND_URL}/api/projects?device_id=${dev}`;
      const res = await fetch(url, {
        method: editId ? 'PATCH' : 'POST', headers: h,
        body: JSON.stringify({ name: name.trim(), description: desc.trim(), color }),
      });
      if (res.ok) { setModalOpen(false); await load(); }
      else Alert.alert('Error', 'Could not save project');
    } catch { Alert.alert('Error', 'Network error'); } finally { setSaving(false); }
  };

  const deleteProject = (p: Project) => {
    Alert.alert('Delete project?', `"${p.name}" will be removed. Your chats inside will remain saved in History.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        const h = await getHeaders(); const dev = await getDeviceId();
        await fetch(`${BACKEND_URL}/api/projects/${p.id}?device_id=${dev}`, { method: 'DELETE', headers: h });
        load();
      }},
    ]);
  };

  const renderProject = ({ item }: { item: Project }) => (
    <TouchableOpacity
      testID={`project-${item.id}`}
      style={styles.card}
      activeOpacity={0.85}
      onPress={() => router.push({ pathname: '/project/[id]', params: { id: item.id, name: item.name, color: item.color } })}
      onLongPress={() => openEdit(item)}
      delayLongPress={400}
    >
      <View style={[styles.swatch, { backgroundColor: item.color }]}>
        <Ionicons name="folder" size={20} color="rgba(0,0,0,0.5)" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.cardName} numberOfLines={1}>{item.name}</Text>
        {item.description ? <Text style={styles.cardDesc} numberOfLines={1}>{item.description}</Text> : null}
        <Text style={styles.cardMeta}>{item.chat_count} {item.chat_count === 1 ? 'chat' : 'chats'}</Text>
      </View>
      <TouchableOpacity testID={`project-del-${item.id}`} onPress={() => deleteProject(item)} hitSlop={10} style={styles.delBtn}>
        <Ionicons name="trash-outline" size={18} color={COLORS.recording} />
      </TouchableOpacity>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={24} color={COLORS.white} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Projects</Text>
          <Text style={styles.sub}>{projects.length} {projects.length === 1 ? 'project' : 'projects'} — long-press to rename</Text>
        </View>
        <TouchableOpacity testID="project-new-btn" onPress={openCreate} style={styles.newBtn} activeOpacity={0.8}>
          <Ionicons name="add" size={18} color={COLORS.primaryDark} />
          <Text style={styles.newBtnText}>New</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centered}><ActivityIndicator color={COLORS.primary} size="large" /></View>
      ) : projects.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="folder-open-outline" size={56} color={COLORS.mutedFg} />
          <Text style={styles.emptyT}>No projects yet</Text>
          <Text style={styles.emptyS}>Create a project to organize your work — CVs, business plans, studies, translations.</Text>
          <TouchableOpacity style={styles.emptyBtn} onPress={openCreate} activeOpacity={0.85}>
            <Ionicons name="add-circle" size={18} color={COLORS.primaryDark} />
            <Text style={styles.emptyBtnT}>Create your first project</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={projects}
          renderItem={renderProject}
          keyExtractor={i => i.id}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          removeClippedSubviews initialNumToRender={10} windowSize={6}
        />
      )}

      <Modal visible={modalOpen} animationType="slide" transparent onRequestClose={() => setModalOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalBg}>
          <View style={styles.modal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editId ? 'Edit project' : 'New project'}</Text>
              <TouchableOpacity onPress={() => setModalOpen(false)} hitSlop={10}>
                <Ionicons name="close" size={24} color={COLORS.mutedFg} />
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>Name</Text>
            <TextInput testID="project-name-input" value={name} onChangeText={setName} style={styles.input} placeholder="My CV project" placeholderTextColor={COLORS.mutedFg} maxLength={80} />

            <Text style={styles.label}>Description (optional)</Text>
            <TextInput value={desc} onChangeText={setDesc} style={[styles.input, { minHeight: 64, textAlignVertical: 'top' }]} multiline placeholder="What is this project about?" placeholderTextColor={COLORS.mutedFg} maxLength={300} />

            <Text style={styles.label}>Color</Text>
            <View style={styles.colorRow}>
              {PROJECT_COLORS.map(c => (
                <TouchableOpacity key={c} onPress={() => setColor(c)} style={[styles.color, { backgroundColor: c, borderColor: color === c ? COLORS.white : 'transparent' }]} />
              ))}
            </View>

            <TouchableOpacity testID="project-save-btn" onPress={save} disabled={saving} style={[styles.saveBtn, saving && { opacity: 0.5 }]} activeOpacity={0.85}>
              {saving ? <ActivityIndicator color={COLORS.primaryDark} /> : (
                <>
                  <Ionicons name="checkmark" size={20} color={COLORS.primaryDark} />
                  <Text style={styles.saveBtnT}>{editId ? 'Save changes' : 'Create project'}</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: Platform.OS === 'android' ? 44 : 12, paddingBottom: 12, borderBottomWidth: 0.5, borderBottomColor: COLORS.muted },
  title: { fontSize: 22, fontWeight: '700', color: COLORS.white },
  sub: { fontSize: 12, color: COLORS.mutedFg, marginTop: 2 },
  newBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: COLORS.primary, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  newBtnText: { fontSize: 14, fontWeight: '700', color: COLORS.primaryDark },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 10 },
  emptyT: { fontSize: 18, fontWeight: '700', color: COLORS.white, marginTop: 8 },
  emptyS: { fontSize: 13, color: COLORS.mutedFg, textAlign: 'center', lineHeight: 19 },
  emptyBtn: { marginTop: 16, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: COLORS.primary, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 22 },
  emptyBtnT: { color: COLORS.primaryDark, fontWeight: '700', fontSize: 14 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, backgroundColor: COLORS.card, borderRadius: 14, marginBottom: 10, borderWidth: 0.5, borderColor: COLORS.muted },
  swatch: { width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  cardName: { fontSize: 15, fontWeight: '700', color: COLORS.white },
  cardDesc: { fontSize: 12, color: COLORS.mutedFg, marginTop: 2 },
  cardMeta: { fontSize: 11, color: COLORS.primary, marginTop: 4, fontWeight: '600' },
  delBtn: { padding: 6 },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modal: { backgroundColor: COLORS.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 32 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: COLORS.white },
  label: { fontSize: 12, color: COLORS.mutedFg, marginBottom: 6, fontWeight: '600', marginTop: 10 },
  input: { backgroundColor: COLORS.bg, color: COLORS.white, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 0.5, borderColor: COLORS.muted, fontSize: 15 },
  colorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 4 },
  color: { width: 36, height: 36, borderRadius: 18, borderWidth: 2 },
  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: COLORS.primary, paddingVertical: 14, borderRadius: 12, marginTop: 20 },
  saveBtnT: { color: COLORS.primaryDark, fontWeight: '700', fontSize: 15 },
});
