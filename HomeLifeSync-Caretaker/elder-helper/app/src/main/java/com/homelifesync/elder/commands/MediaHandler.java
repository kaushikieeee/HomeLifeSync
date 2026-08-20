package com.homelifesync.elder.commands;

import android.Manifest;
import android.app.Notification;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.ImageFormat;
import android.hardware.camera2.CameraCharacteristics;
import android.hardware.camera2.CameraCaptureSession;
import android.hardware.camera2.CameraDevice;
import android.hardware.camera2.CameraManager;
import android.hardware.camera2.CaptureRequest;
import android.hardware.camera2.CaptureResult;
import android.hardware.camera2.CameraAccessException;
import android.hardware.camera2.TotalCaptureResult;
import android.media.Image;
import android.media.ImageReader;
import android.media.MediaPlayer;
import android.media.MediaRecorder;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.Handler;
import android.os.HandlerThread;

import androidx.annotation.NonNull;

import com.homelifesync.elder.Constants;
import com.homelifesync.elder.R;
import com.homelifesync.elder.service.ElderHelperService.ReplyCallback;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.text.SimpleDateFormat;
import java.util.Arrays;
import java.util.Date;
import java.util.Locale;

/**
 * Camera & media commands: PHOTO, PHOTO2, PHOTONOWIFI (remote still capture
 * straight from the service — the elder's screen never lights up),
 * RECORD (remote audio clip), SNAPVID (opens the on-screen camera for video —
 * the only video path that needs the screen) and PLAYMSG (plays the preloaded
 * caretaker voice message, if one was bundled, else a confirmation tone).
 *
 * Still captures are saved to the app's external Pictures folder — no storage
 * permission needed — and the absolute path is returned in the reply so the
 * caretaker can't mistake it for an instant MMS upload.
 */
public class MediaHandler {

    private final Context context;

    public MediaHandler(Context ctx) { context = ctx; }

    /** PHOTO / PHOTO2 / PHOTONOWIFI — capture from the chosen lens. */
    public void photo(ReplyCallback cb, boolean backFacing, boolean onlyOnWifi) {
        if (onlyOnWifi && !onWifi()) {
            cb.reply("⚠️ PHOTONOWIFI — device is not on WiFi.\nPhoto skipped (data saver).");
            return;
        }
        captureStill(cb, backFacing
            ? CameraCharacteristics.LENS_FACING_BACK
            : CameraCharacteristics.LENS_FACING_FRONT);
    }

    /** RECORD — short audio clip saved to the app's files dir. */
    public void record(ReplyCallback cb) {
        if (androidx.core.content.ContextCompat.checkSelfPermission(context,
                Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            cb.reply("❌ RECORD_AUDIO permission needed to record audio.");
            return;
        }
        File dir = context.getExternalFilesDir(Environment.DIRECTORY_MUSIC);
        if (dir == null) dir = context.getFilesDir();
        File out = new File(dir, "clip_" + stamp() + ".m4a");
        MediaRecorder rec = null;
        try {
            rec = new MediaRecorder();
            rec.setAudioSource(MediaRecorder.AudioSource.MIC);
            rec.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4);
            rec.setAudioEncoder(MediaRecorder.AudioEncoder.AAC);
            rec.setOutputFile(out.getAbsolutePath());
            rec.prepare();
            rec.start();
            Thread.sleep(10_000); // 10 s clip
            rec.stop();
            cb.reply("🎙️ 10 s clip recorded →\n" + out.getAbsolutePath()
                + "\n(Review manually — audio isn't sent over SMS.)");
        } catch (Exception e) {
            cb.reply("❌ Recording failed: "
                + (e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName()));
        } finally {
            if (rec != null) { try { rec.release(); } catch (Exception ignored) {} }
        }
    }

    /** SNAPVID — open the camera app to record a short video (screen required). */
    public void snapVideo(ReplyCallback cb) {
        try {
            Intent v = new Intent(android.provider.MediaStore.ACTION_VIDEO_CAPTURE);
            v.putExtra(android.provider.MediaStore.EXTRA_DURATION_LIMIT, 15);
            v.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(v);
            cb.reply("🎥 Video camera opened (auto-stops after 15 s).\n"
                + "Note: video needs the elder's screen — it isn't a silent capture.");
        } catch (Exception e) {
            cb.reply("❌ No camera app found.");
        }
    }

    /** PLAYMSG — play the bundled caretaker voice note, if any. */
    public void playMessage(ReplyCallback cb) {
        int resId = context.getResources().getIdentifier(
            "care_msg", "raw", context.getPackageName());
        try {
            if (resId != 0) {
                final MediaPlayer mp = MediaPlayer.create(context, resId);
                if (mp != null) {
                    mp.setOnCompletionListener(MediaPlayer::release);
                    mp.start();
                    cb.reply("🔊 Played caretaker voice message.");
                    return;
                }
            }
            // No bundled note → confirm with a notification tone so the
            // caretaker knows the command reached the device.
            Uri uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
            MediaPlayer mp = MediaPlayer.create(context, uri);
            if (mp != null) {
                mp.setOnCompletionListener(MediaPlayer::release);
                mp.start();
            }
            cb.reply("ℹ️ No caretaker voice message is bundled yet.\n"
                + "Played a confirmation tone instead.\n"
                + "Add res/raw/care_msg.* to the elder app to enable messages.");
        } catch (Exception e) {
            cb.reply("❌ Could not play message.");
        }
    }

    // ── camera2 still capture ─────────────────────────────────────────

    private void captureStill(ReplyCallback cb, int lensFacing) {
        if (androidx.core.content.ContextCompat.checkSelfPermission(context,
                Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            cb.reply("❌ CAMERA permission needed for photos.");
            return;
        }
        CameraManager cm = (CameraManager) context.getSystemService(Context.CAMERA_SERVICE);
        String camId = null;
        try {
            for (String id : cm.getCameraIdList()) {
                CameraCharacteristics ch = cm.getCameraCharacteristics(id);
                Integer facing = ch.get(CameraCharacteristics.LENS_FACING);
                if (facing != null && facing == lensFacing) { camId = id; break; }
            }
        } catch (CameraAccessException e) {
            cb.reply("❌ Camera access error: " + e.getMessage());
            return;
        }
        if (camId == null) {
            cb.reply("❌ Required camera not found on device.");
            return;
        }

        HandlerThread thread = new HandlerThread("capture");
        thread.start();
        Handler h = new Handler(thread.getLooper());

        ImageReader reader = ImageReader.newInstance(1600, 1200, ImageFormat.JPEG, 1);
        CameraDevice.StateCallback stateCb = new CameraDevice.StateCallback() {
            @Override public void onOpened(@NonNull CameraDevice cam) {
                startStillCapture(cam, reader, h, cb);
            }
            @Override public void onDisconnected(@NonNull CameraDevice cam) {
                cam.close(); closeAll(reader, thread); cb.reply("❌ Camera disconnected.");
            }
            @Override public void onError(@NonNull CameraDevice cam, int error) {
                cam.close(); closeAll(reader, thread); cb.reply("❌ Camera error " + error);
            }
        };

        try {
            cm.openCamera(camId, stateCb, h);
        } catch (CameraAccessException e) {
            closeAll(reader, thread);
            cb.reply("❌ Cannot open camera: " + e.getMessage());
        } catch (SecurityException e) {
            closeAll(reader, thread);
            cb.reply("❌ Camera permission denied.");
        }
    }

    private void startStillCapture(final CameraDevice cam, final ImageReader reader,
                                   final Handler h, ReplyCallback cb) {
        try {
            reader.setOnImageAvailableListener(r -> {
                Image img = null;
                try {
                    img = r.acquireLatestImage();
                    if (img == null) { cb.reply("❌ Photo capture returned nothing."); return; }
                    ByteBuffer buf = img.getPlanes()[0].getBuffer();
                    byte[] bytes = new byte[buf.remaining()];
                    buf.get(bytes);
                    File dir = context.getExternalFilesDir(Environment.DIRECTORY_PICTURES);
                    if (dir == null) dir = context.getFilesDir();
                    File out = new File(dir, "photo_" + stamp() + ".jpg");
                    try (FileOutputStream fos = new FileOutputStream(out)) {
                        fos.write(bytes);
                    }
                    cb.reply("📸 Photo saved →\n" + out.getAbsolutePath()
                        + "\n(Size ~" + (bytes.length / 1024) + " KB)");
                } catch (Exception e) {
                    cb.reply("❌ Photo save failed: "
                        + (e.getMessage() != null ? e.getMessage() : "unknown"));
                } finally {
                    if (img != null) img.close();
                    cam.close();
                    reader.close();
                    h.getLooper().quitSafely();
                }
            }, h);

            CameraCaptureSession.StateCallback sessionCb =
                new CameraCaptureSession.StateCallback() {
                    @Override public void onConfigured(@NonNull CameraCaptureSession session) {
                        try {
                            CaptureRequest.Builder req =
                                cam.createCaptureRequest(CameraDevice.TEMPLATE_STILL_CAPTURE);
                            req.addTarget(reader.getSurface());
                            session.capture(req.build(), new CameraCaptureSession.CaptureCallback() {
                                @Override public void onCaptureCompleted(
                                        @NonNull CameraCaptureSession s,
                                        @NonNull CaptureRequest request,
                                        @NonNull TotalCaptureResult result) {
                                    // ImageReader callback completes the flow.
                                }
                            }, h);
                        } catch (CameraAccessException e) {
                            cb.reply("❌ Capture failed: " + e.getMessage());
                        }
                    }
                    @Override public void onConfigureFailed(@NonNull CameraCaptureSession session) {
                        cb.reply("❌ Camera session could not be configured.");
                    }
                };

            cam.createCaptureSession(
                Arrays.asList(reader.getSurface()), sessionCb, h);
        } catch (Exception e) {
            cb.reply("❌ Capture setup failed: " + e.getMessage());
        }
    }

    private void closeAll(ImageReader reader, HandlerThread thread) {
        try { reader.close(); } catch (Exception ignored) {}
        if (thread != null) thread.quitSafely();
    }

    private boolean onWifi() {
        android.net.ConnectivityManager cm =
            (android.net.ConnectivityManager) context
                .getSystemService(Context.CONNECTIVITY_SERVICE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            android.net.Network n = cm.getActiveNetwork();
            if (n == null) return false;
            android.net.NetworkCapabilities nc = cm.getNetworkCapabilities(n);
            return nc != null && nc.hasTransport(
                android.net.NetworkCapabilities.TRANSPORT_WIFI);
        }
        @SuppressWarnings("deprecation")
        android.net.NetworkInfo wi =
            cm.getNetworkInfo(android.net.ConnectivityManager.TYPE_WIFI);
        return wi != null && wi.isConnected();
    }

    private static String stamp() {
        return new SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(new Date());
    }
}