package expo.modules.timelapse

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Rect
import android.graphics.RectF
import android.graphics.Typeface
import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaFormat
import android.media.MediaMuxer
import android.net.Uri
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import java.io.File
import kotlin.math.max
import kotlin.math.roundToInt
import kotlin.math.roundToLong

class FrameInput : Record {
  @Field
  val uri: String = ""

  @Field
  val label: String? = null
}

class ExportOptions : Record {
  @Field
  val frames: List<FrameInput> = emptyList()

  @Field
  val outputPath: String = ""

  @Field
  val width: Int = 720

  @Field
  val height: Int = 960

  @Field
  val fps: Double = 4.0

  @Field
  val holdLastSeconds: Double = 1.0

  @Field
  val watermark: String? = null

  /** "plain": 흰 굵은 글자 왼쪽 아래 / "film": 주황색 필름 날짜 도장 오른쪽 아래 */
  @Field
  val labelStyle: String = "plain"
}

/**
 * 사진 여러 장을 한 장씩 프레임으로 넣어 H.264 MP4를 만든다.
 * 사진은 화면 크기에 맞춰 가운데를 채우고(cover), 날짜 글자와 워터마크를 그린 뒤
 * YUV로 바꿔 인코더에 직접 넣는다 (프레임마다 시간을 정확히 정하려고).
 */
class TimelapseModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("Timelapse")

    Events("onProgress")

    AsyncFunction("exportAsync") { options: ExportOptions ->
      export(options)
    }
  }

  private fun pathOf(uri: String): String {
    return if (uri.startsWith("file://")) Uri.parse(uri).path ?: uri else uri
  }

  private fun export(o: ExportOptions): String {
    val w = max(2, o.width and 1.inv())
    val h = max(2, o.height and 1.inv())
    val fps = max(1.0, o.fps)
    val outFile = File(pathOf(o.outputPath))
    outFile.parentFile?.mkdirs()
    if (outFile.exists()) outFile.delete()

    val format = MediaFormat.createVideoFormat(MediaFormat.MIMETYPE_VIDEO_AVC, w, h).apply {
      setInteger(MediaFormat.KEY_COLOR_FORMAT, MediaCodecInfo.CodecCapabilities.COLOR_FormatYUV420Flexible)
      setInteger(MediaFormat.KEY_BIT_RATE, w * h * 4)
      setInteger(MediaFormat.KEY_FRAME_RATE, max(1, fps.roundToInt()))
      setInteger(MediaFormat.KEY_I_FRAME_INTERVAL, 1)
    }
    val codec = MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_VIDEO_AVC)
    codec.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
    codec.start()
    val muxer = MediaMuxer(outFile.absolutePath, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)

    val state = MuxState()
    val canvasBitmap = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(canvasBitmap)
    val pixels = IntArray(w * h)
    val frameUs = (1_000_000.0 / fps).roundToLong()

    try {
      var t = 0L
      var drewAny = false
      val n = o.frames.size
      for ((i, frame) in o.frames.withIndex()) {
        val src = decode(pathOf(frame.uri), w, h) ?: continue
        drawFrame(canvas, src, w, h, frame.label, o.watermark, o.labelStyle == "film")
        src.recycle()
        canvasBitmap.getPixels(pixels, 0, w, 0, 0, w, h)
        queueFrame(codec, muxer, state, pixels, w, h, t)
        drewAny = true
        t += frameUs
        sendEvent("onProgress", mapOf("progress" to (i + 1).toDouble() / max(1, n).toDouble()))
      }
      if (!drewAny) throw Exception("사진을 읽지 못했어요")

      // 마지막 사진을 조금 더 보여 준다 (같은 프레임을 끝에 한 번 더)
      if (o.holdLastSeconds > 0) {
        t += (o.holdLastSeconds * 1_000_000).roundToLong() - frameUs
        queueFrame(codec, muxer, state, pixels, w, h, t)
      }

      // 끝 표시
      while (true) {
        val idx = codec.dequeueInputBuffer(10_000)
        if (idx >= 0) {
          codec.queueInputBuffer(idx, 0, 0, t + frameUs, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
          break
        }
        drain(codec, muxer, state, false)
      }
      drain(codec, muxer, state, true)
    } finally {
      canvasBitmap.recycle()
      try {
        codec.stop()
      } catch (_: Exception) {
      }
      codec.release()
      try {
        if (state.started) muxer.stop()
      } catch (_: Exception) {
      }
      muxer.release()
    }
    return Uri.fromFile(outFile).toString()
  }

  private class MuxState {
    var track = -1
    var started = false
  }

  private fun queueFrame(codec: MediaCodec, muxer: MediaMuxer, state: MuxState, argb: IntArray, w: Int, h: Int, ptsUs: Long) {
    while (true) {
      val idx = codec.dequeueInputBuffer(10_000)
      if (idx >= 0) {
        // 버퍼 크기를 먼저 알아 둔다 (getInputImage 뒤에는 이 버퍼를 쓰면 안 된다)
        val capacity = codec.getInputBuffer(idx)?.capacity() ?: (w * h * 3 / 2)
        val image = codec.getInputImage(idx) ?: throw Exception("인코더 입력을 받지 못했어요")
        writeYuv(image, argb, w, h)
        // 기기마다 줄 간격(rowStride)이 달라서, 실제 평면 배치로 데이터 크기를 잰다
        val p = image.planes
        val ySize = p[0].rowStride * h
        val uvSize = if (p[1].pixelStride == 2) p[1].rowStride * (h / 2) else p[1].rowStride * (h / 2) + p[2].rowStride * (h / 2)
        val size = minOf(capacity, maxOf(w * h * 3 / 2, ySize + uvSize))
        codec.queueInputBuffer(idx, 0, size, ptsUs, 0)
        break
      }
      drain(codec, muxer, state, false)
    }
    drain(codec, muxer, state, false)
  }

  /** ARGB 픽셀을 인코더가 준 YUV 이미지 평면에 쓴다 (평면 간격은 기기마다 다르니 그대로 따른다) */
  private fun writeYuv(image: android.media.Image, argb: IntArray, w: Int, h: Int) {
    val planes = image.planes
    val yBuf = planes[0].buffer
    val yRow = planes[0].rowStride
    val yPix = planes[0].pixelStride
    val uBuf = planes[1].buffer
    val uRow = planes[1].rowStride
    val uPix = planes[1].pixelStride
    val vBuf = planes[2].buffer
    val vRow = planes[2].rowStride
    val vPix = planes[2].pixelStride

    for (y in 0 until h) {
      for (x in 0 until w) {
        val c = argb[y * w + x]
        val r = (c shr 16) and 0xff
        val g = (c shr 8) and 0xff
        val b = c and 0xff
        val yy = ((66 * r + 129 * g + 25 * b + 128) shr 8) + 16
        yBuf.put(y * yRow + x * yPix, yy.coerceIn(0, 255).toByte())
        if ((y and 1) == 0 && (x and 1) == 0) {
          val u = ((-38 * r - 74 * g + 112 * b + 128) shr 8) + 128
          val v = ((112 * r - 94 * g - 18 * b + 128) shr 8) + 128
          uBuf.put((y / 2) * uRow + (x / 2) * uPix, u.coerceIn(0, 255).toByte())
          vBuf.put((y / 2) * vRow + (x / 2) * vPix, v.coerceIn(0, 255).toByte())
        }
      }
    }
  }

  private fun drain(codec: MediaCodec, muxer: MediaMuxer, state: MuxState, untilEnd: Boolean) {
    val info = MediaCodec.BufferInfo()
    while (true) {
      val idx = codec.dequeueOutputBuffer(info, if (untilEnd) 10_000 else 0)
      when {
        idx == MediaCodec.INFO_TRY_AGAIN_LATER -> {
          if (!untilEnd) return
        }
        idx == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> {
          state.track = muxer.addTrack(codec.outputFormat)
          muxer.start()
          state.started = true
        }
        idx >= 0 -> {
          val buf = codec.getOutputBuffer(idx)
          if ((info.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG) != 0) info.size = 0
          if (info.size > 0 && buf != null && state.started) {
            buf.position(info.offset)
            buf.limit(info.offset + info.size)
            muxer.writeSampleData(state.track, buf, info)
          }
          codec.releaseOutputBuffer(idx, false)
          if ((info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0) return
        }
      }
    }
  }

  /** 필요한 크기에 가깝게 줄여 읽는다 (메모리 절약) */
  private fun decode(path: String, w: Int, h: Int): Bitmap? {
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeFile(path, bounds)
    if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null
    var sample = 1
    while (bounds.outWidth / (sample * 2) >= w && bounds.outHeight / (sample * 2) >= h) sample *= 2
    val opts = BitmapFactory.Options().apply { inSampleSize = sample }
    return BitmapFactory.decodeFile(path, opts)
  }

  private fun drawFrame(canvas: Canvas, src: Bitmap, w: Int, h: Int, label: String?, watermark: String?, film: Boolean) {
    canvas.drawColor(Color.BLACK)
    val scale = max(w.toFloat() / src.width, h.toFloat() / src.height)
    val dw = src.width * scale
    val dh = src.height * scale
    val dst = RectF((w - dw) / 2f, (h - dh) / 2f, (w + dw) / 2f, (h + dh) / 2f)
    canvas.drawBitmap(src, Rect(0, 0, src.width, src.height), dst, Paint(Paint.FILTER_BITMAP_FLAG))

    val margin = w * 0.04f
    if (!label.isNullOrEmpty()) {
      if (film) {
        // 옛날 필름 카메라 날짜 도장: 주황색 고정폭 글자에 번지는 빛
        val p = Paint(Paint.ANTI_ALIAS_FLAG).apply {
          color = Color.rgb(255, 159, 67)
          textSize = h * 0.038f
          typeface = Typeface.create(Typeface.MONOSPACE, Typeface.BOLD)
          letterSpacing = 0.08f
          setShadowLayer(h * 0.012f, 0f, 0f, Color.argb(230, 255, 120, 20))
        }
        val tw = p.measureText(label)
        canvas.drawText(label, w - margin - tw, h - margin - p.descent(), p)
      } else {
        val p = Paint(Paint.ANTI_ALIAS_FLAG).apply {
          color = Color.WHITE
          textSize = h * 0.04f
          typeface = Typeface.DEFAULT_BOLD
          setShadowLayer(4f, 0f, 2f, 0x99000000.toInt())
        }
        canvas.drawText(label, margin, h - margin - p.descent(), p)
      }
    }
    if (!watermark.isNullOrEmpty()) {
      val p = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.argb(217, 255, 255, 255)
        textSize = h * 0.028f
        typeface = Typeface.DEFAULT_BOLD
        setShadowLayer(4f, 0f, 2f, 0x99000000.toInt())
      }
      val tw = p.measureText(watermark)
      // 필름 날짜가 오른쪽 아래에 있으면 워터마크는 오른쪽 위로
      val y = if (film) margin - p.ascent() else h - margin - p.descent()
      canvas.drawText(watermark, w - margin - tw, y, p)
    }
  }
}
