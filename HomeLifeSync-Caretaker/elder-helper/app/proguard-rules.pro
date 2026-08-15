# Keep all classes in the app package (SMS receiver + service must not be renamed)
-keep class com.homelifesync.elder.** { *; }

# Google Play Services Location
-keep class com.google.android.gms.location.** { *; }
