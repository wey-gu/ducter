// lift: cut the subjects out of an image with macOS Vision's foreground
// instance mask (macOS 14+), at the image's full resolution.
//
//   swift tools/art/lift.swift in.png out-prefix
//
// writes <out-prefix>-<n>.png: one 8-bit grey alpha mask per instance
// Vision finds, and prints each instance's bounding box. Compositing the
// mask with the image is left to the caller (tools/art/title_layers.py),
// which keeps colors straight (no fringe) and can merge instances.
import AppKit
import CoreImage
import Vision

let args = CommandLine.arguments
guard args.count == 3, let src = NSImage(contentsOfFile: args[1]),
      let cg = src.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
    FileHandle.standardError.write("usage: lift in.png out-prefix\n".data(using: .utf8)!)
    exit(2)
}
let req = VNGenerateForegroundInstanceMaskRequest()
let handler = VNImageRequestHandler(cgImage: cg)
try handler.perform([req])
guard let obs = req.results?.first else { print("no subject"); exit(1) }
let ctx = CIContext()
for idx in obs.allInstances {
    let buf = try obs.generateScaledMaskForImage(forInstances: IndexSet(integer: idx), from: handler)
    let ci = CIImage(cvPixelBuffer: buf)
    let out = URL(fileURLWithPath: "\(args[2])-\(idx).png")
    try ctx.writePNGRepresentation(of: ci, to: out, format: .L8, colorSpace: CGColorSpaceCreateDeviceGray())
    print("instance \(idx): \(out.path)")
}
