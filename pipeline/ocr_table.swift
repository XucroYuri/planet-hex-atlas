// OCR the National Bureau of Statistics yearbook table into coordinate-tagged text.
// Usage: swift pipeline/ocr_table.swift <image.jpg>
// Requires macOS Vision (no third-party OCR service, no network).
import Foundation
import Vision
import AppKit

let path = CommandLine.arguments[1]
guard let image = NSImage(contentsOfFile: path),
      let tiff = image.tiffRepresentation,
      let bitmap = NSBitmapImageRep(data: tiff),
      let cg = bitmap.cgImage else { fatalError("cannot read image") }
let request = VNRecognizeTextRequest { req, _ in
    guard let observations = req.results as? [VNRecognizedTextObservation] else { return }
    for observation in observations {
        guard let text = observation.topCandidates(1).first else { continue }
        let box = observation.boundingBox
        print(String(format: "%.4f\t%.4f\t%.4f\t%.4f\t%@",
                     box.minX, box.minY, box.width, box.height, text.string))
    }
}
request.recognitionLevel = .accurate
request.recognitionLanguages = ["zh-Hans", "en-US"]
request.usesLanguageCorrection = false
try VNImageRequestHandler(cgImage: cg, options: [:]).perform([request])
