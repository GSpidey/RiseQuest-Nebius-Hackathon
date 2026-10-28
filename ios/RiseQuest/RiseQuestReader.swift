import Foundation
import UIKit
import React
import UniformTypeIdentifiers
import Vision
import PDFKit
import ImageIO
import ReplayKit

@objc(RiseQuestReader)
class RiseQuestReader: NSObject, UIDocumentPickerDelegate {
  static let group = "group.com.goldenepics.risequest.reader"
  private var resolveDocument: RCTPromiseResolveBlock?
  private var rejectDocument: RCTPromiseRejectBlock?
  private var generation = UUID()
  @objc static func requiresMainQueueSetup() -> Bool { true }
  private func folder() throws -> URL {
    guard let url = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: Self.group) else {
      throw NSError(domain:"RiseQuestReader",code:1,userInfo:[NSLocalizedDescriptionKey:"Screen reading could not start. Please update RiseQuest."])
    }
    return url
  }
  private func topController() -> UIViewController? {
    var controller = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.flatMap { $0.windows }.first { $0.isKeyWindow }?.rootViewController
    while let presented = controller?.presentedViewController { controller=presented }
    return controller
  }
  @objc(importDocument:rejecter:)
  func importDocument(_ resolve:@escaping RCTPromiseResolveBlock,rejecter reject:@escaping RCTPromiseRejectBlock) {
    DispatchQueue.main.async {
      guard self.resolveDocument == nil, let parent=self.topController() else { reject("READER_BUSY","Finish the current import first.",nil);return }
      self.resolveDocument=resolve;self.rejectDocument=reject
      let picker=UIDocumentPickerViewController(forOpeningContentTypes:[.pdf,.image,.plainText],asCopy:false)
      picker.delegate=self;picker.allowsMultipleSelection=false;parent.present(picker,animated:true)
    }
  }
  func documentPickerWasCancelled(_ controller:UIDocumentPickerViewController) { resolveDocument?(nil);resolveDocument=nil;rejectDocument=nil }
  func documentPicker(_ controller:UIDocumentPickerViewController,didPickDocumentsAt urls:[URL]) {
    guard let url=urls.first,let resolve=resolveDocument,let reject=rejectDocument else{return}
    resolveDocument=nil;rejectDocument=nil;let version=generation
    DispatchQueue.global(qos:.userInitiated).async {
      let access=url.startAccessingSecurityScopedResource();defer{if access{url.stopAccessingSecurityScopedResource()}}
      do {
        let values=try url.resourceValues(forKeys:[.fileSizeKey,.contentTypeKey])
        guard let size=values.fileSize,size<=20*1024*1024 else {throw self.error("Choose a document under 20 MB.")}
        let data=try Data(contentsOf:url,options:.mappedIfSafe);guard data.count<=20*1024*1024 else{throw self.error("Choose a document under 20 MB.")}
        var text=""
        if values.contentType?.conforms(to:.pdf)==true {
          guard let pdf=PDFDocument(data:data),!pdf.isLocked,pdf.pageCount<=30 else{throw self.error("Choose an unlocked PDF with up to 30 pages.")}
          for i in 0..<pdf.pageCount {
            let pageText:String = try autoreleasepool {
              guard let page=pdf.page(at:i) else{return ""}
              if let plain=page.string,!plain.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty {return plain}
              let bounds=page.bounds(for:.mediaBox),scale=1600/max(max(bounds.width,bounds.height),1)
              let format=UIGraphicsImageRendererFormat();format.scale=1;format.opaque=true
              let image=UIGraphicsImageRenderer(size:CGSize(width:max(1,bounds.width*scale),height:max(1,bounds.height*scale)),format:format).image { context in
                UIColor.white.setFill();context.fill(CGRect(x:0,y:0,width:max(1,bounds.width*scale),height:max(1,bounds.height*scale)))
                context.cgContext.translateBy(x:0,y:bounds.height*scale);context.cgContext.scaleBy(x:scale,y:-scale);page.draw(with:.mediaBox,to:context.cgContext)
              }
              guard let cg=image.cgImage else{return ""};return try self.ocr(cg)
            }
            text+=pageText+"\n\n";if text.count>=30000{break}
          }
        } else if values.contentType?.conforms(to:.image)==true {
          guard let source=CGImageSourceCreateWithData(data as CFData,nil),let image=CGImageSourceCreateThumbnailAtIndex(source,0,[kCGImageSourceCreateThumbnailFromImageAlways:true,kCGImageSourceThumbnailMaxPixelSize:1600,kCGImageSourceCreateThumbnailWithTransform:true] as CFDictionary)else{throw self.error("This image could not be opened.")}
          text=try self.ocr(image)
        } else if values.contentType?.conforms(to:.plainText)==true {text=String(data:data,encoding:.utf8) ?? ""}
        else{throw self.error("Choose a PDF, image or plain-text file.")}
        DispatchQueue.main.async {if self.generation==version{resolve(["text":String(text.prefix(30000))])}else{reject("READER_CANCELLED","Reading cancelled.",nil)}}
      }catch {reject("READER_DOCUMENT",error.localizedDescription,error)}
    }
  }
  private func error(_ message:String)->NSError{NSError(domain:"RiseQuestReader",code:2,userInfo:[NSLocalizedDescriptionKey:message])}
  private func ocr(_ image:CGImage)throws->String {
    let request=VNRecognizeTextRequest();request.recognitionLevel = .accurate;request.usesLanguageCorrection=true
    try VNImageRequestHandler(cgImage:image).perform([request])
    return (request.results ?? []).compactMap{$0.topCandidates(1).first?.string}.joined(separator:"\n")
  }
  @objc(startCapture:resolver:rejecter:)
  func startCapture(_ session:String,resolver resolve:@escaping RCTPromiseResolveBlock,rejecter reject:@escaping RCTPromiseRejectBlock) {
    DispatchQueue.main.async {
      do{
        guard session.range(of:"^[a-zA-Z0-9_-]{8,100}$",options:.regularExpression) != nil,let parent=self.topController() else{throw self.error("Reopen the reader.")}
        let folder=try self.folder();try? FileManager.default.removeItem(at:folder.appendingPathComponent("result.json"))
        let request:[String:Any]=["session":session,"expires":Date().timeIntervalSince1970+120,"stopped":false]
        try JSONSerialization.data(withJSONObject:request).write(to:folder.appendingPathComponent("request.json"),options:[.atomic,.completeFileProtectionUntilFirstUserAuthentication])
        let panel=ReaderStartController();panel.cancel={self.stopCapture()};parent.present(panel,animated:true);resolve(true)
      }catch{reject("READER_CAPTURE",error.localizedDescription,error)}
    }
  }
  @objc(captureStatus:resolver:rejecter:)
  func captureStatus(_ session:String,resolver resolve:RCTPromiseResolveBlock,rejecter reject:RCTPromiseRejectBlock) {
    do{
      let folder=try folder();let request=(try? Data(contentsOf:folder.appendingPathComponent("request.json"))).flatMap{try? JSONSerialization.jsonObject(with:$0) as? [String:Any]}
      let result=(try? Data(contentsOf:folder.appendingPathComponent("result.json"))).flatMap{try? JSONSerialization.jsonObject(with:$0) as? [String:Any]}
      let same=(request?["session"] as? String)==session
      let active=same && (request?["stopped"] as? Bool) != true && (request?["expires"] as? Double ?? 0)>Date().timeIntervalSince1970
      resolve(["active":active,"text":same && (result?["session"] as? String)==session ? (result?["text"] as? String ?? "") : ""])
    }catch{reject("READER_CAPTURE","Screen reading stopped.",error)}
  }
  @objc func stopCapture() {
    DispatchQueue.main.async {
      self.generation=UUID();self.resolveDocument=nil;self.rejectDocument?("READER_CANCELLED","Reading cancelled.",nil);self.rejectDocument=nil
      guard let folder=try? self.folder() else{return}
      // Removing the request revokes the extension session on its next 1-second tick.
      try? FileManager.default.removeItem(at:folder.appendingPathComponent("request.json"))
      try? FileManager.default.removeItem(at:folder.appendingPathComponent("result.json"))
    }
  }
}
private class ReaderStartController:UIViewController {
  var cancel:(()->Void)?
  override func viewDidLoad(){
    super.viewDidLoad();view.backgroundColor = .systemBackground
    let label=UILabel();label.text="Start screen reading, then switch to the page you want to read. Return to RiseQuest to review the text. Reading ends after two minutes.";label.numberOfLines=0
    let picker=RPSystemBroadcastPickerView(frame:CGRect(x:0,y:0,width:64,height:64));picker.preferredExtension="com.goldenepics.risequest.reader";picker.showsMicrophoneButton=false
    let done=UIButton(type:.system);done.setTitle("Continue",for:.normal);done.addTarget(self,action:#selector(close),for:.touchUpInside)
    let stop=UIButton(type:.system);stop.setTitle("Cancel screen reading",for:.normal);stop.addTarget(self,action:#selector(cancelReading),for:.touchUpInside)
    let stack=UIStackView(arrangedSubviews:[label,picker,done,stop]);stack.axis = .vertical;stack.spacing=24;stack.alignment = .center;stack.translatesAutoresizingMaskIntoConstraints=false;view.addSubview(stack)
    NSLayoutConstraint.activate([stack.leadingAnchor.constraint(equalTo:view.leadingAnchor,constant:24),stack.trailingAnchor.constraint(equalTo:view.trailingAnchor,constant:-24),stack.topAnchor.constraint(equalTo:view.safeAreaLayoutGuide.topAnchor,constant:32),picker.heightAnchor.constraint(equalToConstant:64),picker.widthAnchor.constraint(equalToConstant:64)])
  }
  @objc private func close(){dismiss(animated:true)}
  @objc private func cancelReading(){cancel?();dismiss(animated:true)}
}
