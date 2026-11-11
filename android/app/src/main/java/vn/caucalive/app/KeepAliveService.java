package vn.caucalive.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;

/**
 * Dịch vụ chạy nền có thông báo: giữ tiến trình (máy chủ Node, giọng MC, nhạc) sống khi bạn
 * chuyển sang app TikTok để bắt đầu live, để MIUI không tắt app. Nút "Đóng quán" trên thông báo tắt hẳn app.
 */
public class KeepAliveService extends Service {
    static final String STOP = "vn.caucalive.app.STOP";

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && STOP.equals(intent.getAction())) {
            stopForeground(STOP_FOREGROUND_REMOVE);
            stopSelf();
            Runtime.getRuntime().exit(0);   // Node không dừng riêng được: tắt cả tiến trình
            return START_NOT_STICKY;
        }
        NotificationManager nm = getSystemService(NotificationManager.class);
        nm.createNotificationChannel(new NotificationChannel("quan", "Quán đang mở", NotificationManager.IMPORTANCE_LOW));
        PendingIntent open = PendingIntent.getActivity(this, 0,
                new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP), PendingIntent.FLAG_IMMUTABLE);
        PendingIntent stop = PendingIntent.getService(this, 1,
                new Intent(this, KeepAliveService.class).setAction(STOP), PendingIntent.FLAG_IMMUTABLE);
        Notification n = new Notification.Builder(this, "quan")
                .setSmallIcon(android.R.drawable.ic_media_play)
                .setContentTitle("🍻 Quán Cậu Cả đang mở")
                .setContentText("Chạm để quay lại quán")
                .setContentIntent(open)
                .addAction(new Notification.Action.Builder(null, "Đóng quán", stop).build())
                .setOngoing(true)
                .build();
        if (Build.VERSION.SDK_INT >= 29) startForeground(1, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
        else startForeground(1, n);
        return START_STICKY;
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }
}
