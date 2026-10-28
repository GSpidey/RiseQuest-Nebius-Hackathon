#import <React/RCTBridgeModule.h>
@interface RCT_EXTERN_MODULE(RiseQuestReader, NSObject)
RCT_EXTERN_METHOD(importDocument:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(startCapture:(NSString *)session resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(captureStatus:(NSString *)session resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(stopCapture)
@end
