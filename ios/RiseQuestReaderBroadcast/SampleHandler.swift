import ReplayKit
import Vision
import CoreImage
import ImageIO

final class SampleHandler:RPBroadcastSampleHandler {
  private let folder=FileManager.default.containerURL(forSecurityApplicationGroupIdentifier:"group.com.goldenepics.risequest.reader")
  private var session=""
  private var lastFrame=Date.distantPast
  private var timer:DispatchSourceTimer?
  private let queue=DispatchQueue(label:"com.goldenepics.risequest.reader")
  private let context=CIContext(options:[.cacheIntermediates:false])
  private var finished=false
  override func broadcastStarted(withSetupInfo setupInfo:[String:NSObject]?){
    queue.async {
      guard let request=self.request(),let session=request["session"] as? String,self.valid(request) else{self.stop();return}
      self.session=session
      let timer=DispatchSource.makeTimerSource(queue:self.queue);timer.schedule(deadline:.now()+1,repeating:1)
      timer.setEventHandler{[weak self] in guard let self=self else{return};guard let request=self.request(),self.valid(request),request["session"] as? String==self.session else{self.stop();return}}
      self.timer=timer;timer.resume()
    }
  }
  private func request()->[String:Any]?{
    guard let url=folder?.appendingPathComponent("request.json"),let data=try? Data(contentsOf:url) else{return nil}
    return (try? JSONSerialization.jsonObject(with:data)) as? [String:Any]
  }
  private func valid(_ value:[String:Any])->Bool {
    value["stopped"] as? Bool != true && (value["expires"] as? Double ?? 0)>Date().timeIntervalSince1970
  }
  private func stop(){
    guard !finished else{return};finished=true;timer?.cancel();timer=nil
    finishBroadcastWithError(NSError(domain:"RiseQuestReader",code:0,userInfo:[NSLocalizedDescriptionKey:"Screen reading has ended. Return to RiseQuest to review your text."]))
  }
  override func broadcastFinished(){queue.async {self.finished=true;self.timer?.cancel();self.timer=nil}}
  override func processSampleBuffer(_ sampleBuffer:CMSampleBuffer,with sampleBufferType:RPSampleBufferType){
    guard sampleBufferType == .video else{return} // Microphone and app audio are never processed.
    // Sync keeps at most one frame alive and bounds extension memory.
    queue.sync {
      guard !finished,!session.isEmpty,Date().timeIntervalSince(lastFrame)>=2 else{return}
      guard let request=request(),valid(request),request["session"] as? String==session else{stop();return}
      lastFrame=Date()
      autoreleasepool {
        guard let buffer=CMSampleBufferGetImageBuffer(sampleBuffer),let folder=folder else{return}
        let input=CIImage(cvPixelBuffer:buffer),scale=min(1,1200/max(input.extent.width,input.extent.height))
        let scaled=input.transformed(by:CGAffineTransform(scaleX:scale,y:scale))
        guard let image=context.createCGImage(scaled,from:scaled.extent)else{return}
        let raw=(CMGetAttachment(sampleBuffer,key:RPVideoSampleOrientationKey as CFString,attachmentModeOut:nil) as? NSNumber)?.uint32Value ?? 1
        let request=VNRecognizeTextRequest();request.recognitionLevel = .accurate
        do{
          try VNImageRequestHandler(cgImage:image,orientation:CGImagePropertyOrientation(rawValue:raw) ?? .up).perform([request])
          let text=(request.results ?? []).compactMap{$0.topCandidates(1).first?.string}.joined(separator:"\n")
          guard !text.isEmpty,let current=self.request(),valid(current),current["session"] as? String==session else{return}
          let result:[String:Any]=["session":session,"text":String(text.prefix(30000))]
          try JSONSerialization.data(withJSONObject:result).write(to:folder.appendingPathComponent("result.json"),options:[.atomic,.completeFileProtectionUntilFirstUserAuthentication])
        }catch{} // A protected/empty frame leaves the last readable passage available.
      }
    }
  }
}
