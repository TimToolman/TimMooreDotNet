// Expo config, generated from brand.config.js so the app name lives in one
// place. To rename the app, edit brand.config.js (see BRANDING.md) — do not
// hardcode the name here.
const brand = require('./brand.config');

const camera = `${brand.displayName} uses the camera so you can photograph the contents of a box and add it to your inventory.`;
const photos = `${brand.displayName} needs access to your photo library so you can attach existing photos to a box.`;
const photosAdd = `${brand.displayName} can save box photos back to your photo library.`;

module.exports = {
  expo: {
    name: brand.displayName,
    slug: brand.slug,
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/icon.png',
    scheme: brand.scheme,
    userInterfaceStyle: 'automatic',
    newArchEnabled: true,
    splash: {
      image: './assets/splash-icon.png',
      resizeMode: 'contain',
      backgroundColor: '#ffffff',
    },
    assetBundlePatterns: ['**/*'],
    ios: {
      supportsTablet: true,
      bundleIdentifier: brand.iosBundleId,
      buildNumber: '1',
      infoPlist: {
        NSCameraUsageDescription: camera,
        NSPhotoLibraryUsageDescription: photos,
        NSPhotoLibraryAddUsageDescription: photosAdd,
        ITSAppUsesNonExemptEncryption: false,
      },
    },
    android: {
      package: brand.androidPackage,
      versionCode: 1,
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: '#0071e3',
      },
      permissions: ['android.permission.CAMERA', 'android.permission.READ_MEDIA_IMAGES'],
    },
    web: {
      favicon: './assets/favicon.png',
      bundler: 'metro',
    },
    plugins: [
      ['expo-image-picker', { photosPermission: photos, cameraPermission: camera }],
      'expo-secure-store',
    ],
    extra: {
      aiProxyUrl: 'https://REPLACE_WITH_YOUR_WORKER.workers.dev',
      eas: {
        projectId: '00000000-0000-0000-0000-000000000000',
      },
    },
  },
};
