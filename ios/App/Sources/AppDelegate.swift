// AppDelegate.swift — 极核无线诊断 App 入口
import UIKit

@main
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        window = UIWindow(frame: UIScreen.main.bounds)
        window?.backgroundColor = UIColor(red: 10 / 255.0, green: 15 / 255.0, blue: 24 / 255.0, alpha: 1.0)
        window?.rootViewController = ViewController()
        window?.makeKeyAndVisible()
        return true
    }
}