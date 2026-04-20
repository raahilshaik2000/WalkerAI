#import <React/RCTViewManager.h>
#import <React/RCTConvert.h>

@class USDZViewerView;

@interface USDZViewerViewManager : RCTViewManager
@end

@implementation USDZViewerViewManager

RCT_EXPORT_MODULE(USDZViewerView)

- (UIView *)view {
  Class viewClass = NSClassFromString(@"WalkerAI.USDZViewerView");
  if (!viewClass) {
    viewClass = NSClassFromString(@"USDZViewerView");
  }
  return [[viewClass alloc] init];
}

RCT_EXPORT_VIEW_PROPERTY(filePath, NSString)
RCT_EXPORT_VIEW_PROPERTY(measurementData, NSString)

+ (BOOL)requiresMainQueueSetup {
  return YES;
}

@end
