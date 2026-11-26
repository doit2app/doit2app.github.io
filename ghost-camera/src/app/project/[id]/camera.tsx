// 촬영: 저장하면 프로젝트에 넣고, 알림을 다시 잡고, (켜져 있으면) 사진첩에도 저장한다.

import { router, useLocalSearchParams } from 'expo-router';
import { Alert, View } from 'react-native';

import { getProject, listShots } from '../../../data/db';
import { shotUri } from '../../../data/files';
import { addShot, getBool, SETTING_SAVE_TO_GALLERY, useData } from '../../../data/store';
import { albumName, saveToGallery } from '../../../gallery';
import { scheduleReminder } from '../../../reminders';
import { CameraScreen } from '../../../screens/CameraScreen';

export default function CameraRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data } = useData(async () => {
    const [project, shots] = await Promise.all([getProject(id), listShots(id)]);
    return { project, shots };
  }, [id]);

  if (!data?.project) return <View style={{ flex: 1, backgroundColor: '#000' }} />;
  const project = data.project;

  return (
    <CameraScreen
      project={project}
      shots={data.shots}
      onClose={() => router.back()}
      onSave={async (tempUri, { tilt, facing }) => {
        try {
          const shot = await addShot(project.id, tempUri, {
            roll: tilt?.roll ?? null,
            pitch: tilt?.pitch ?? null,
            facing,
          });
          await scheduleReminder(project, shot.takenAt).catch(() => {});
          if (await getBool(SETTING_SAVE_TO_GALLERY, true)) {
            saveToGallery(shotUri(shot), albumName(project.name)).catch(() => {});
          }
          router.back();
        } catch (e) {
          Alert.alert('저장하지 못했어요', String(e));
        }
      }}
    />
  );
}
