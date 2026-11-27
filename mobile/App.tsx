import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { useReducer, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  fakeGenerate,
  MAX_MEMO_LENGTH,
  normalizeMemo,
  NOT_MENTIONED,
  summarizeMemo,
  type SummaryResult,
} from "../src/lib/summarize";
import { ApiError, createApiClient, DEFAULT_API_BASE_URL } from "./src/api";
import {
  filledCount,
  formatDate,
  recordsReducer,
  recordTitle,
  SAMPLE_MEMO,
  sourceSentences,
  type CounselingRecord,
} from "./src/records";

type Tab = "memo" | "records";
type Mode = "offline" | "ai";

// 本番の API。EXPO_PUBLIC_API_BASE_URL で差し替えられる
const api = createApiClient(
  process.env.EXPO_PUBLIC_API_BASE_URL ?? DEFAULT_API_BASE_URL,
);

export default function App() {
  const [tab, setTab] = useState<Tab>("memo");
  const [records, dispatch] = useReducer(recordsReducer, []);

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.root}>
        <StatusBar style="dark" />
        <Text style={styles.appTitle}>カウンセリング記録</Text>
        <View style={styles.tabs}>
          <TabButton
            label="メモ"
            active={tab === "memo"}
            onPress={() => setTab("memo")}
          />
          <TabButton
            label={`記録（${records.length}）`}
            active={tab === "records"}
            onPress={() => setTab("records")}
          />
        </View>
        {tab === "memo" ? (
          <MemoScreen
            onSave={(record) => {
              dispatch({ type: "add", record });
              setTab("records");
            }}
          />
        ) : (
          <RecordsScreen
            records={records}
            onRemove={(id) => dispatch({ type: "remove", id })}
          />
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

function TabButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.tab, active && styles.tabActive]}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
    >
      <Text style={[styles.tabText, active && styles.tabTextActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

function ModeButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.mode, active && styles.modeActive]}
      accessibilityRole="radio"
      accessibilityState={{ selected: active }}
    >
      <Text style={[styles.modeText, active && styles.modeTextActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

function MemoScreen({
  onSave,
}: {
  onSave: (record: CounselingRecord) => void;
}) {
  const [memo, setMemo] = useState("");
  const [result, setResult] = useState<SummaryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Web 版（ブラウザ）は別オリジンの API を呼べないため、見本のみ
  const [mode, setMode] = useState<Mode>("offline");
  const [remaining, setRemaining] = useState<number | null>(null);

  const summarize = async () => {
    const checked = normalizeMemo(memo);
    if (!checked.ok) {
      setError(checked.error);
      return;
    }
    setError(null);
    setBusy(true);
    try {
      if (mode === "ai") {
        // Web版と同じ API。ログイン・回数制限・AIの出力の検査はサーバー側で行う
        const r = await api.summarize(checked.memo);
        setResult(r.result);
        if (r.remaining !== undefined) setRemaining(r.remaining);
      } else {
        // 見本は通信なし（キーワードで当てる）
        setResult(await summarizeMemo(checked.memo, fakeGenerate));
      }
    } catch (e) {
      if (e instanceof ApiError && e.remaining !== undefined)
        setRemaining(e.remaining);
      setError(e instanceof Error ? e.message : "まとめられませんでした");
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.help}>
          キーボードのマイクで話した内容をそのまま入れてください。
        </Text>
        {Platform.OS !== "web" && (
          <View style={styles.modes}>
            <ModeButton
              label="見本（通信なし）"
              active={mode === "offline"}
              onPress={() => setMode("offline")}
            />
            <ModeButton
              label={
                remaining === null
                  ? "AIでまとめる"
                  : `AIでまとめる（今日あと${remaining}回）`
              }
              active={mode === "ai"}
              onPress={() => setMode("ai")}
            />
          </View>
        )}
        <TextInput
          style={styles.input}
          multiline
          value={memo}
          onChangeText={(t) => {
            setMemo(t);
            setResult(null);
          }}
          placeholder="例：今日は肩くらいまで短くしたい…"
          maxLength={MAX_MEMO_LENGTH}
          accessibilityLabel="メモ"
        />
        <Text style={styles.counter}>
          {memo.length} / {MAX_MEMO_LENGTH}
        </Text>
        <View style={styles.row}>
          <Pressable
            style={styles.secondary}
            onPress={() => setMemo(SAMPLE_MEMO)}
          >
            <Text style={styles.secondaryText}>例文を入れる</Text>
          </Pressable>
          <Pressable
            style={[styles.primary, busy && styles.disabled]}
            onPress={summarize}
            disabled={busy}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryText}>記録にまとめる</Text>
            )}
          </Pressable>
        </View>
        {error && <Text style={styles.error}>{error}</Text>}
        {result && (
          <>
            <SummaryView result={result} />
            <Pressable
              style={styles.primary}
              onPress={() =>
                onSave({
                  id: String(Date.now()),
                  createdAt: Date.now(),
                  memo,
                  result,
                })
              }
            >
              <Text style={styles.primaryText}>この内容で保存</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/** 各項目と根拠の番号。番号を押すと、もとの文を出す。 */
function SummaryView({ result }: { result: SummaryResult }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <View style={styles.card}>
      {result.fields.map((f) => {
        const missing = f.text === NOT_MENTIONED;
        return (
          <View key={f.label} style={styles.field}>
            <Text style={styles.label}>{f.label}</Text>
            <Text style={[styles.value, missing && styles.missing]}>
              {f.text}
            </Text>
            {f.sources.length > 0 && (
              <Pressable
                onPress={() => setOpen(open === f.label ? null : f.label)}
                accessibilityRole="button"
              >
                <Text style={styles.source}>
                  根拠 {f.sources.map((n) => `[${n}]`).join(" ")}
                </Text>
              </Pressable>
            )}
            {open === f.label &&
              sourceSentences(result, f.sources).map((s) => (
                <Text key={s} style={styles.quote}>
                  {s}
                </Text>
              ))}
          </View>
        );
      })}
    </View>
  );
}

function RecordsScreen({
  records,
  onRemove,
}: {
  records: CounselingRecord[];
  onRemove: (id: string) => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  if (records.length === 0)
    return (
      <Text style={[styles.help, styles.body]}>まだ記録はありません。</Text>
    );
  return (
    <FlatList
      data={records}
      keyExtractor={(r) => r.id}
      contentContainerStyle={styles.body}
      renderItem={({ item }) => (
        <View style={styles.card}>
          <Pressable
            onPress={() => setOpenId(openId === item.id ? null : item.id)}
            accessibilityRole="button"
          >
            <Text style={styles.recordTitle}>{recordTitle(item)}</Text>
            <Text style={styles.help}>
              {formatDate(item.createdAt)}・5項目中{filledCount(item.result)}
            </Text>
          </Pressable>
          {openId === item.id && (
            <>
              <SummaryView result={item.result} />
              <Pressable onPress={() => onRemove(item.id)}>
                <Text style={styles.remove}>この記録を消す</Text>
              </Pressable>
            </>
          )}
        </View>
      )}
    />
  );
}

const C = {
  primary: "#3b5bdb",
  text: "#1f2933",
  sub: "#616e7c",
  line: "#e4e7eb",
  bg: "#f5f7fa",
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  flex: { flex: 1 },
  appTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: C.text,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  tabs: {
    flexDirection: "row",
    margin: 16,
    marginBottom: 0,
    borderRadius: 8,
    backgroundColor: C.line,
    padding: 4,
  },
  tab: { flex: 1, paddingVertical: 8, borderRadius: 6, alignItems: "center" },
  tabActive: { backgroundColor: "#fff" },
  tabText: { color: C.sub, fontWeight: "600" },
  tabTextActive: { color: C.text },
  body: { padding: 16, gap: 12 },
  help: { color: C.sub, fontSize: 13 },
  input: {
    minHeight: 160,
    backgroundColor: "#fff",
    borderColor: C.line,
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    textAlignVertical: "top",
    fontSize: 15,
    color: C.text,
  },
  modes: { flexDirection: "row", gap: 8 },
  mode: {
    flex: 1,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: "center",
    backgroundColor: "#fff",
  },
  modeActive: { borderColor: C.primary, backgroundColor: "#edf2ff" },
  modeText: { fontSize: 13, color: C.sub },
  modeTextActive: { color: C.primary, fontWeight: "700" },
  counter: { alignSelf: "flex-end", color: C.sub, fontSize: 12 },
  row: { flexDirection: "row", gap: 8 },
  primary: {
    flex: 1,
    backgroundColor: C.primary,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
  },
  primaryText: { color: "#fff", fontWeight: "700" },
  secondary: {
    flex: 1,
    borderColor: C.primary,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
  },
  secondaryText: { color: C.primary, fontWeight: "700" },
  disabled: { opacity: 0.6 },
  error: { color: "#c92a2a" },
  card: {
    backgroundColor: "#fff",
    borderRadius: 8,
    borderColor: C.line,
    borderWidth: 1,
    padding: 12,
    gap: 8,
  },
  field: { gap: 2, paddingVertical: 4 },
  label: { fontSize: 12, fontWeight: "700", color: C.sub },
  value: { fontSize: 15, color: C.text },
  missing: { color: "#9aa5b1" },
  source: { fontSize: 12, color: C.primary },
  quote: {
    fontSize: 12,
    color: C.sub,
    backgroundColor: C.bg,
    padding: 6,
    borderRadius: 4,
  },
  recordTitle: { fontSize: 15, fontWeight: "700", color: C.text },
  remove: { color: "#c92a2a", fontSize: 13, alignSelf: "flex-end" },
});
