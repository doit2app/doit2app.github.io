// 사진첩(갤러리)에 저장. 앱을 지워도 사진이 남는 안전망이고, iCloud 사진·Google 포토가 백업해 준다.
// 프로젝트 이름으로 앨범을 만들어 넣는다. 앨범을 읽을 권한이 없으면(iOS "추가만 허용") 앨범 없이 저장한다.

import { Album, Asset, requestPermissionsAsync } from 'expo-media-library';

export function albumName(projectName: string) {
  return `그자리 · ${projectName}`;
}

/** 저장했으면 true */
export async function saveToGallery(uri: string, album: string | null): Promise<boolean> {
  try {
    const perm = await requestPermissionsAsync(true);
    if (!perm.granted) return false;
    if (album) {
      try {
        const existing = await Album.get(album);
        if (existing) {
          await Asset.create(uri, existing);
        } else {
          const asset = await Asset.create(uri);
          await Album.create(album, [asset]);
        }
        return true;
      } catch {
        // 앨범을 다룰 권한이 없으면 사진만 저장
      }
    }
    await Asset.create(uri);
    return true;
  } catch (e) {
    console.warn('갤러리 저장 실패', e);
    return false;
  }
}
