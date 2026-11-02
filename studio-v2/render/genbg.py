import sys
import torch
from diffusers import AutoPipelineForText2Image

pipe = AutoPipelineForText2Image.from_pretrained(
    sys.argv[5] if len(sys.argv) > 5 else "stabilityai/sdxl-turbo",
    torch_dtype=torch.float16, variant="fp16",
).to("mps")
img = pipe(sys.argv[1], num_inference_steps=int(sys.argv[6]) if len(sys.argv) > 6 else 4,
           guidance_scale=0.0, height=int(sys.argv[4]), width=int(sys.argv[3])).images[0]
img.save(sys.argv[2])
print("saved", sys.argv[2])
