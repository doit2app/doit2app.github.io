// 찍었거나 불러온 사진을 프로젝트 비율로 자르고 줄인다.

import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { centerCrop, outputSize, Ratio, ratioValue } from './frame';

/**
 * 찍었거나 불러온 사진을 프로젝트 비율로 가운데를 잘라 줄이고, 임시 파일로 만든다.
 * 돌려준 uri는 캐시라 "저장"을 눌러야 앱 폴더로 옮긴다.
 *
 * - 사진의 회전 정보(EXIF)는 이미지 편집 모듈이 읽을 때 반영된다고 보고, 실제 크기를 먼저 잰다.
 *   그래도 세로로 찍었는데 가로로 나오면(회전 정보가 반영되지 않은 경우) rotateIfLandscape만큼 돌린다.
 * - flip: 앞 카메라 사진이 미리보기처럼 좌우 반전되어 있지 않을 때 뒤집는다.
 */
export async function cropToRatio(
  uri: string,
  ratio: Ratio,
  opts: { rotateIfLandscape?: number; flip?: boolean } = {},
): Promise<{ uri: string; width: number; height: number }> {
  // 크기 재기용과 편집용을 따로 만든다
  const probe = await ImageManipulator.manipulate(uri).renderAsync();
  let ctx = ImageManipulator.manipulate(uri);
  let width = probe.width;
  let height = probe.height;
  if (opts.rotateIfLandscape && width > height) {
    ctx = ctx.rotate(opts.rotateIfLandscape);
    [width, height] = [height, width];
  }
  if (opts.flip) ctx = ctx.flip('horizontal');
  const crop = centerCrop(width, height, ratioValue(ratio));
  const size = outputSize(crop);
  const image = await ctx.crop(crop).resize(size).renderAsync();
  const result = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.85 });
  return { uri: result.uri, width: image.width, height: image.height };
}
