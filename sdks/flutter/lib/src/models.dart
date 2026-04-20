class NotifyXUser {
  final String id;
  final String externalUserId;
  final String? nickname;
  final String appId;
  final String language;
  final String timezone;
  final String createdAt;
  final String updatedAt;

  NotifyXUser({
    required this.id,
    required this.externalUserId,
    this.nickname,
    required this.appId,
    required this.language,
    required this.timezone,
    required this.createdAt,
    required this.updatedAt,
  });

  factory NotifyXUser.fromJson(Map<String, dynamic> json) {
    return NotifyXUser(
      id: json['id']?.toString() ?? '',
      externalUserId: json['externalUserId']?.toString() ?? '',
      nickname: json['nickname']?.toString(),
      appId: json['appId']?.toString() ?? '',
      language: json['language']?.toString() ?? 'en',
      timezone: json['timezone']?.toString() ?? 'UTC',
      createdAt: json['createdAt']?.toString() ?? '',
      updatedAt: json['updatedAt']?.toString() ?? '',
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'externalUserId': externalUserId,
      'nickname': nickname,
        'appId': appId,
        'language': language,
        'timezone': timezone,
        'createdAt': createdAt,
        'updatedAt': updatedAt,
      };
}

class NotifyXDevice {
  final String id;
  final String userId;
  final String platform;
  final String pushToken;
  final String provider;
  final bool isActive;
  final String createdAt;
  final String updatedAt;

  NotifyXDevice({
    required this.id,
    required this.userId,
    required this.platform,
    required this.pushToken,
    required this.provider,
    required this.isActive,
    required this.createdAt,
    required this.updatedAt,
  });

  factory NotifyXDevice.fromJson(Map<String, dynamic> json) {
    return NotifyXDevice(
      id: json['id']?.toString() ?? '',
      userId: json['userId']?.toString() ?? '',
      platform: json['platform']?.toString() ?? '',
      pushToken: json['pushToken']?.toString() ?? '',
      provider: json['provider']?.toString() ?? '',
      isActive: json['isActive'] == true,
      createdAt: json['createdAt']?.toString() ?? '',
      updatedAt: json['updatedAt']?.toString() ?? '',
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'userId': userId,
        'platform': platform,
        'pushToken': pushToken,
        'provider': provider,
        'isActive': isActive,
        'createdAt': createdAt,
        'updatedAt': updatedAt,
      };
}

class NotificationActionPayload {
  final Map<String, dynamic>? data;
  final String? actionId;

  NotificationActionPayload({this.data, this.actionId});
}
