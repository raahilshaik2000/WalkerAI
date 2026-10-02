#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(WalkerInAppBrowser, NSObject)

RCT_EXTERN_METHOD(openURL:
                  (NSString *)url
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(close:
                  (RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
