import Foundation
import Vision
import CoreImage
import CoreImage.CIFilterBuiltins
let args = CommandLine.arguments
let inDir = URL(fileURLWithPath: args[1]), outDir = URL(fileURLWithPath: args[2])
let ctx = CIContext()
for f in try FileManager.default.contentsOfDirectory(atPath: inDir.path) where f.hasSuffix(".png") {
  let url = inDir.appendingPathComponent(f)
  guard let ci = CIImage(contentsOf: url) else { continue }
  let req = VNGenerateForegroundInstanceMaskRequest()
  let h = VNImageRequestHandler(ciImage: ci)
  do {
    try h.perform([req])
    guard let r = req.results?.first else { print("NOMASK", f); continue }
    let buf = try r.generateMaskedImage(ofInstances: r.allInstances, from: h, croppedToInstancesExtent: false)
    let out = CIImage(cvPixelBuffer: buf)
    let dst = outDir.appendingPathComponent(f)
    try ctx.writePNGRepresentation(of: out, to: dst, format: .RGBA8, colorSpace: CGColorSpace(name: CGColorSpace.sRGB)!)
    print("OK", f, r.allInstances.count)
  } catch { print("ERR", f, error) }
}
