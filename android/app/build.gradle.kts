plugins {
    id("com.android.application")
}

android {
    namespace = "vn.caucalive.app"
    compileSdk = 35
    ndkVersion = providers.gradleProperty("ndkVersion").getOrElse("29.0.14206865")

    defaultConfig {
        applicationId = "vn.caucalive.app"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0"
        // Redmi K40 và hầu hết điện thoại đời mới: chỉ cần arm64
        ndk { abiFilters += listOf("arm64-v8a") }
        externalNativeBuild { cmake { arguments += listOf("-DANDROID_STL=c++_shared") } }
    }

    externalNativeBuild { cmake { path = file("src/main/cpp/CMakeLists.txt"); version = "3.31.6" } }

    // libnode.so của nodejs-mobile do build-apk.sh chép vào app/libnode/bin/<abi>/
    sourceSets["main"].jniLibs.directories.add("libnode/bin")

    // khóa ký bản phát hành: build-apk.sh lấy đường dẫn + mật khẩu (từ Keychain) qua biến môi trường
    val ksFile = System.getenv("CAUCA_KS_FILE")
    val ksPass = System.getenv("CAUCA_KS_PASS")
    signingConfigs {
        create("release") {
            if (ksFile != null && ksPass != null) {
                storeFile = file(ksFile); storePassword = ksPass; keyPassword = ksPass
                keyAlias = System.getenv("CAUCA_KS_ALIAS") ?: "caucalive"
            }
        }
    }
    buildTypes {
        release {
            isMinifyEnabled = false
            if (ksFile != null && ksPass != null) signingConfig = signingConfigs.getByName("release")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    // zip mã nguồn Node đã nén sẵn, không nén lần nữa
    androidResources { noCompress += listOf("zip") }

    packaging { jniLibs { useLegacyPackaging = true } }
}
