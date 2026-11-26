import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { CameraScreen } from './src/screens/CameraScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { addShot, cropToRatio, deleteShot, loadProject, Project, setRatio } from './src/storage';

// 프로토타입: 프로젝트 하나, 화면 두 개(홈·촬영). 실제 앱에서는 Expo Router로 나눈다.
export default function App() {
  const [project, setProject] = useState<Project | null>(null);
  const [screen, setScreen] = useState<'home' | 'camera'>('home');

  useEffect(() => {
    loadProject().then(setProject);
  }, []);

  if (!project) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style={screen === 'camera' ? 'light' : 'dark'} />
      {screen === 'home' ? (
        <HomeScreen
          project={project}
          onOpenCamera={() => setScreen('camera')}
          onImport={async (uri) => {
            try {
              const cropped = await cropToRatio(uri, project.ratio);
              setProject(await addShot(project, cropped.uri, null));
            } catch (e) {
              Alert.alert('사진을 불러오지 못했어요', String(e));
            }
          }}
          onDelete={async (id) => setProject(await deleteShot(project, id))}
          onRatio={async (r) => setProject(await setRatio(project, r))}
        />
      ) : (
        <CameraScreen
          project={project}
          onClose={() => setScreen('home')}
          onSave={async (uri, tilt) => {
            setProject(await addShot(project, uri, tilt));
            setScreen('home');
          }}
        />
      )}
    </SafeAreaProvider>
  );
}
