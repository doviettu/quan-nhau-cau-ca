// Cầu nối JNI: chạy Node.js (nodejs-mobile) trong app, chuyển stdout/stderr của Node sang logcat (thẻ CAUCA-NODE).
#include <jni.h>
#include <android/log.h>
#include <pthread.h>
#include <unistd.h>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <vector>
#include <string>
#include "node.h"

static int pipeOut[2], pipeErr[2];

static void *pump(void *arg) {
    const int prio = (int)(intptr_t)arg;
    const int fd = prio == ANDROID_LOG_ERROR ? pipeErr[0] : pipeOut[0];
    char buf[2048];
    ssize_t n;
    while ((n = read(fd, buf, sizeof buf - 1)) > 0) {
        if (buf[n - 1] == '\n') --n;
        buf[n] = 0;
        __android_log_write(prio, "CAUCA-NODE", buf);
    }
    return nullptr;
}

static void redirectStdio() {
    setvbuf(stdout, nullptr, _IONBF, 0);
    setvbuf(stderr, nullptr, _IONBF, 0);
    if (pipe(pipeOut) == 0 && pipe(pipeErr) == 0) {
        dup2(pipeOut[1], STDOUT_FILENO);
        dup2(pipeErr[1], STDERR_FILENO);
        pthread_t a, b;
        pthread_create(&a, nullptr, pump, (void *)(intptr_t)ANDROID_LOG_INFO);
        pthread_create(&b, nullptr, pump, (void *)(intptr_t)ANDROID_LOG_ERROR);
        pthread_detach(a);
        pthread_detach(b);
    }
}

extern "C" JNIEXPORT jint JNICALL
Java_vn_caucalive_app_MainActivity_startNode(JNIEnv *env, jclass, jobjectArray jargs) {
    // node::Start cần mọi tham số nằm liền nhau trong một vùng nhớ
    const jsize argc = env->GetArrayLength(jargs);
    std::vector<std::string> args;
    size_t total = 0;
    for (jsize i = 0; i < argc; i++) {
        auto js = (jstring)env->GetObjectArrayElement(jargs, i);
        const char *s = env->GetStringUTFChars(js, nullptr);
        args.emplace_back(s);
        env->ReleaseStringUTFChars(js, s);
        env->DeleteLocalRef(js);
        total += args.back().size() + 1;
    }
    char *block = (char *)calloc(total, 1);
    std::vector<char *> argv(argc);
    char *p = block;
    for (jsize i = 0; i < argc; i++) {
        memcpy(p, args[i].c_str(), args[i].size());
        argv[i] = p;
        p += args[i].size() + 1;
    }
    redirectStdio();
    return (jint)node::Start(argc, argv.data());
}
