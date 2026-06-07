#import <React/RCTViewManager.h>
#import <React/RCTUIManager.h>
#import <React/RCTConvert.h>

@class RoomCustomizerView;

@interface RoomCustomizerViewManager : RCTViewManager
@end

@implementation RoomCustomizerViewManager

RCT_EXPORT_MODULE(RoomCustomizerView)

- (UIView *)view {
  Class viewClass = NSClassFromString(@"WalkerAI.RoomCustomizerView");
  if (!viewClass) {
    viewClass = NSClassFromString(@"RoomCustomizerView");
  }
  return [[viewClass alloc] init];
}

RCT_EXPORT_VIEW_PROPERTY(measurementData, NSString)
RCT_EXPORT_VIEW_PROPERTY(roomType, NSString)
RCT_EXPORT_VIEW_PROPERTY(onSurfaceTap, RCTBubblingEventBlock)

RCT_EXPORT_METHOD(setSurfaceMaterial:(nonnull NSNumber *)reactTag
                                surfaceId:(NSString *)surfaceId
                                 colorHex:(NSString *)colorHex
                                roughness:(nonnull NSNumber *)roughness
                                metalness:(nonnull NSNumber *)metalness)
{
  [self.bridge.uiManager addUIBlock:^(RCTUIManager *uiManager, NSDictionary<NSNumber *,UIView *> *viewRegistry) {
    UIView *view = viewRegistry[reactTag];
    SEL selector = NSSelectorFromString(@"setSurfaceMaterial:colorHex:roughness:metalness:");
    if ([view respondsToSelector:selector]) {
      NSMethodSignature *signature = [view methodSignatureForSelector:selector];
      NSInvocation *invocation = [NSInvocation invocationWithMethodSignature:signature];
      invocation.target = view;
      invocation.selector = selector;
      NSString *sid = surfaceId ?: @"";
      NSString *cx = colorHex ?: @"";
      [invocation setArgument:&sid atIndex:2];
      [invocation setArgument:&cx atIndex:3];
      [invocation setArgument:&roughness atIndex:4];
      [invocation setArgument:&metalness atIndex:5];
      [invocation invoke];
    }
  }];
}

+ (BOOL)requiresMainQueueSetup {
  return YES;
}

@end
