#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(WalkerVoiceAssistant, NSObject)

RCT_EXTERN_METHOD(requestPermissions:
                  (RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(speak:
                  (NSString *)text
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(stopSpeaking:
                  (RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(listenOnce:
                  (NSString *)locale
                  durationSeconds:(nonnull NSNumber *)durationSeconds
                  contextualStrings:(NSArray *)contextualStrings
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
