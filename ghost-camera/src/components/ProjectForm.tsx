// 새 프로젝트·프로젝트 설정에서 같이 쓰는 입력 칸

import { StyleSheet, Text, TextInput, View } from 'react-native';

import { Ratio, RATIOS } from '../frame';
import { hourLabel, INTERVALS, REMIND_HOURS } from '../reminders';
import { C, Chip, ChipRow, Label } from '../ui';

export type ProjectFormValue = { name: string; ratio: Ratio; intervalDays: number; remindHour: number };

const RATIO_HINT: Record<Ratio, string> = {
  '3:4': '세로 사진 (기본)',
  '1:1': '정사각형',
  '9:16': '꽉 찬 세로 (릴스·쇼츠)',
};

export function ProjectForm({
  value,
  onChange,
  ratioLocked,
}: {
  value: ProjectFormValue;
  onChange: (v: ProjectFormValue) => void;
  /** 사진이 있으면 비율은 바꿀 수 없다 (지난 사진과 겹쳐 맞출 수 없으니) */
  ratioLocked?: boolean;
}) {
  const set = (patch: Partial<ProjectFormValue>) => onChange({ ...value, ...patch });
  return (
    <View>
      <Label>이름</Label>
      <TextInput
        value={value.name}
        onChangeText={(name) => set({ name })}
        placeholder="예: 몬스테라, 우리 아이 키, 베란다 창밖"
        placeholderTextColor={C.faint}
        style={styles.input}
        maxLength={40}
        returnKeyType="done"
      />

      <Label>사진 비율{ratioLocked ? ' (사진이 있어서 바꿀 수 없어요)' : ''}</Label>
      <ChipRow>
        {RATIOS.map((r) => (
          <Chip key={r} label={r} on={value.ratio === r} onPress={() => !ratioLocked && set({ ratio: r })} />
        ))}
      </ChipRow>
      <Text style={styles.hint}>{RATIO_HINT[value.ratio]}</Text>

      <Label>얼마나 자주 찍을까요?</Label>
      <ChipRow>
        {INTERVALS.map((i) => (
          <Chip key={i.days} label={i.label} on={value.intervalDays === i.days} onPress={() => set({ intervalDays: i.days })} />
        ))}
      </ChipRow>

      {value.intervalDays > 0 && (
        <>
          <Label>알림 시각</Label>
          <ChipRow>
            {REMIND_HOURS.map((h) => (
              <Chip key={h} label={hourLabel(h)} on={value.remindHour === h} onPress={() => set({ remindHour: h })} />
            ))}
          </ChipRow>
          <Text style={styles.hint}>마지막 사진을 찍은 날부터 세어서 알려 드려요.</Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  input: {
    height: 50,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: C.card,
    paddingHorizontal: 14,
    fontSize: 16,
    color: C.text,
  },
  hint: { fontSize: 12, color: C.faint, marginTop: 8 },
});
