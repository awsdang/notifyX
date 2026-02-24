import 'package:flutter_test/flutter_test.dart';
import 'package:react_native_notification_test/main.dart';

void main() {
  testWidgets('Smoke test for NotifyXExampleApp', (WidgetTester tester) async {
    // Build our app and trigger a frame.
    await tester.pumpWidget(const NotifyXExampleApp());

    // Verify that the title is present.
    expect(find.text('NotifyX Demo'), findsOneWidget);
    expect(find.text('Status:\nNot initialized'), findsOneWidget);
  });
}
