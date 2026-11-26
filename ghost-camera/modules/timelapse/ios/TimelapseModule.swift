import AVFoundation
import ExpoModulesCore
import UIKit

struct FrameInput: Record {
  @Field var uri: String = ""
  @Field var label: String? = nil
}

struct ExportOptions: Record {
  @Field var frames: [FrameInput] = []
  @Field var outputPath: String = ""
  @Field var width: Int = 720
  @Field var height: Int = 960
  @Field var fps: Double = 4
  @Field var holdLastSeconds: Double = 1
  @Field var watermark: String? = nil
  /// "plain": 흰 굵은 글자 왼쪽 아래 / "film": 주황색 필름 날짜 도장 오른쪽 아래
  @Field var labelStyle: String = "plain"
}

enum TimelapseError: Error, CustomStringConvertible {
  case badOutput
  case writer(String)
  case noFrames

  var description: String {
    switch self {
    case .badOutput: return "출력 경로가 잘못됐어요"
    case .writer(let m): return "영상 만들기 실패: \(m)"
    case .noFrames: return "사진을 읽지 못했어요"
    }
  }
}

/// 사진 여러 장을 한 장씩 프레임으로 넣어 H.264 MP4를 만든다.
/// 사진은 화면 크기에 맞춰 가운데를 채우고(cover), 날짜 글자와 워터마크를 그린다.
public class TimelapseModule: Module {
  public func definition() -> ModuleDefinition {
    Name("Timelapse")

    Events("onProgress")

    AsyncFunction("exportAsync") { (options: ExportOptions) -> String in
      return try self.export(options)
    }
  }

  private func export(_ o: ExportOptions) throws -> String {
    guard let outURL = URL(string: o.outputPath), outURL.isFileURL else { throw TimelapseError.badOutput }
    try? FileManager.default.removeItem(at: outURL)

    let w = max(2, o.width & ~1)
    let h = max(2, o.height & ~1)
    let fps = max(1.0, o.fps)

    let writer = try AVAssetWriter(outputURL: outURL, fileType: .mp4)
    let settings: [String: Any] = [
      AVVideoCodecKey: AVVideoCodecType.h264,
      AVVideoWidthKey: w,
      AVVideoHeightKey: h,
      AVVideoCompressionPropertiesKey: [AVVideoAverageBitRateKey: w * h * 4],
    ]
    let input = AVAssetWriterInput(mediaType: .video, outputSettings: settings)
    input.expectsMediaDataInRealTime = false
    let attrs: [String: Any] = [
      kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32ARGB,
      kCVPixelBufferWidthKey as String: w,
      kCVPixelBufferHeightKey as String: h,
    ]
    let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: attrs)
    writer.add(input)
    guard writer.startWriting() else {
      throw TimelapseError.writer(writer.error?.localizedDescription ?? "시작 실패")
    }
    writer.startSession(atSourceTime: .zero)

    let timescale: Int32 = 600
    var t = 0.0
    var last: CVPixelBuffer? = nil
    let n = o.frames.count

    for (i, frame) in o.frames.enumerated() {
      guard let image = loadImage(frame.uri) else { continue }
      guard let pb = makeBuffer(adaptor: adaptor, width: w, height: h, draw: { ctx in
        self.drawFrame(ctx: ctx, image: image, width: w, height: h, label: frame.label, watermark: o.watermark, film: o.labelStyle == "film")
      }) else { continue }
      try append(adaptor: adaptor, input: input, buffer: pb, seconds: t, timescale: timescale)
      last = pb
      t += 1.0 / fps
      sendEvent("onProgress", ["progress": Double(i + 1) / Double(max(1, n))])
    }

    guard let lastBuffer = last else {
      writer.cancelWriting()
      throw TimelapseError.noFrames
    }
    // 마지막 사진을 조금 더 보여 준다
    if o.holdLastSeconds > 0 {
      t += o.holdLastSeconds
      try append(adaptor: adaptor, input: input, buffer: lastBuffer, seconds: t - 1.0 / fps, timescale: timescale)
    }

    input.markAsFinished()
    writer.endSession(atSourceTime: CMTime(seconds: t, preferredTimescale: timescale))
    let done = DispatchSemaphore(value: 0)
    writer.finishWriting { done.signal() }
    done.wait()
    if writer.status != .completed {
      throw TimelapseError.writer(writer.error?.localizedDescription ?? "마무리 실패")
    }
    return outURL.absoluteString
  }

  private func append(
    adaptor: AVAssetWriterInputPixelBufferAdaptor,
    input: AVAssetWriterInput,
    buffer: CVPixelBuffer,
    seconds: Double,
    timescale: Int32
  ) throws {
    while !input.isReadyForMoreMediaData {
      Thread.sleep(forTimeInterval: 0.005)
    }
    if !adaptor.append(buffer, withPresentationTime: CMTime(seconds: seconds, preferredTimescale: timescale)) {
      throw TimelapseError.writer("프레임 추가 실패")
    }
  }

  private func loadImage(_ uri: String) -> UIImage? {
    if let url = URL(string: uri), url.isFileURL {
      return UIImage(contentsOfFile: url.path)
    }
    return UIImage(contentsOfFile: uri)
  }

  private func makeBuffer(
    adaptor: AVAssetWriterInputPixelBufferAdaptor,
    width: Int,
    height: Int,
    draw: (CGContext) -> Void
  ) -> CVPixelBuffer? {
    var pb: CVPixelBuffer? = nil
    if let pool = adaptor.pixelBufferPool {
      CVPixelBufferPoolCreatePixelBuffer(nil, pool, &pb)
    } else {
      let attrs: [String: Any] = [
        kCVPixelBufferCGImageCompatibilityKey as String: true,
        kCVPixelBufferCGBitmapContextCompatibilityKey as String: true,
      ]
      CVPixelBufferCreate(nil, width, height, kCVPixelFormatType_32ARGB, attrs as CFDictionary, &pb)
    }
    guard let buffer = pb else { return nil }
    CVPixelBufferLockBaseAddress(buffer, [])
    defer { CVPixelBufferUnlockBaseAddress(buffer, []) }
    guard let ctx = CGContext(
      data: CVPixelBufferGetBaseAddress(buffer),
      width: width,
      height: height,
      bitsPerComponent: 8,
      bytesPerRow: CVPixelBufferGetBytesPerRow(buffer),
      space: CGColorSpaceCreateDeviceRGB(),
      bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue
    ) else { return nil }
    // UIKit 좌표(위가 0)로 그리게 뒤집는다
    ctx.translateBy(x: 0, y: CGFloat(height))
    ctx.scaleBy(x: 1, y: -1)
    UIGraphicsPushContext(ctx)
    draw(ctx)
    UIGraphicsPopContext()
    return buffer
  }

  private func drawFrame(ctx: CGContext, image: UIImage, width: Int, height: Int, label: String?, watermark: String?, film: Bool) {
    let W = CGFloat(width)
    let H = CGFloat(height)
    UIColor.black.setFill()
    UIRectFill(CGRect(x: 0, y: 0, width: W, height: H))

    // 가운데를 채우게 (cover)
    let iw = image.size.width
    let ih = image.size.height
    if iw > 0 && ih > 0 {
      let scale = max(W / iw, H / ih)
      let dw = iw * scale
      let dh = ih * scale
      image.draw(in: CGRect(x: (W - dw) / 2, y: (H - dh) / 2, width: dw, height: dh))
    }

    let shadow = NSShadow()
    shadow.shadowColor = UIColor.black.withAlphaComponent(0.6)
    shadow.shadowOffset = CGSize(width: 0, height: 2)
    shadow.shadowBlurRadius = 4

    let margin = W * 0.04
    if let label = label, !label.isEmpty {
      if film {
        // 옛날 필름 카메라 날짜 도장: 주황색 고정폭 글자에 번지는 빛
        let glow = NSShadow()
        glow.shadowColor = UIColor(red: 1, green: 0.47, blue: 0.08, alpha: 0.9)
        glow.shadowOffset = .zero
        glow.shadowBlurRadius = H * 0.012
        let attrs: [NSAttributedString.Key: Any] = [
          .font: UIFont.monospacedSystemFont(ofSize: H * 0.038, weight: .bold),
          .foregroundColor: UIColor(red: 1, green: 0.62, blue: 0.26, alpha: 1),
          .shadow: glow,
          .kern: H * 0.004,
        ]
        let s = label as NSString
        let size = s.size(withAttributes: attrs)
        s.draw(at: CGPoint(x: W - margin - size.width, y: H - margin - size.height), withAttributes: attrs)
      } else {
        let attrs: [NSAttributedString.Key: Any] = [
          .font: UIFont.systemFont(ofSize: H * 0.04, weight: .bold),
          .foregroundColor: UIColor.white,
          .shadow: shadow,
        ]
        let s = label as NSString
        let size = s.size(withAttributes: attrs)
        s.draw(at: CGPoint(x: margin, y: H - margin - size.height), withAttributes: attrs)
      }
    }
    if let wm = watermark, !wm.isEmpty {
      let attrs: [NSAttributedString.Key: Any] = [
        .font: UIFont.systemFont(ofSize: H * 0.028, weight: .semibold),
        .foregroundColor: UIColor.white.withAlphaComponent(0.85),
        .shadow: shadow,
      ]
      let s = wm as NSString
      let size = s.size(withAttributes: attrs)
      // 필름 날짜가 오른쪽 아래에 있으면 워터마크는 오른쪽 위로
      let y = film ? margin : H - margin - size.height
      s.draw(at: CGPoint(x: W - margin - size.width, y: y), withAttributes: attrs)
    }
  }
}
