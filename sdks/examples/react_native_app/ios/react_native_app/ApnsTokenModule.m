#import <React/RCTBridgeModule.h>

@interface ApnsTokenModule : NSObject <RCTBridgeModule>
@end

@implementation ApnsTokenModule

RCT_EXPORT_MODULE(ApnsToken);

+ (BOOL)requiresMainQueueSetup {
  return NO;
}

RCT_EXPORT_METHOD(getToken:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  NSString *token = [[NSUserDefaults standardUserDefaults] stringForKey:@"notifyx_apns_token"];
  NSString *errorMsg = [[NSUserDefaults standardUserDefaults] stringForKey:@"notifyx_apns_error"];

  if (token && token.length > 0) {
    resolve(token);
  } else if (errorMsg && errorMsg.length > 0) {
    reject(@"apns_error", errorMsg, nil);
  } else {
    reject(@"apns_not_ready",
           @"APNs token not available yet. Ensure notification permission is granted.",
           nil);
  }
}

@end
