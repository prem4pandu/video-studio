"""Original reusable robot asset; run with Blender --background --python ... -- OUTPUT."""
import bpy
import math
import os
import sys
from mathutils import Vector

out = os.path.abspath(sys.argv[sys.argv.index('--') + 1])
os.makedirs(out, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

def material(name, color, roughness=.55):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (*color, 1)
    m.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = roughness
    return m

cream = material('Warm porcelain', (.91, .79, .57))
teal = material('Deep teal', (.025, .19, .19))
orange = material('Terracotta', (.77, .22, .10))
eye = material('Eye light', (.99, .94, .74))

def rounded(name, location, size, mat, bevel=.15, parent=None):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    mod = obj.modifiers.new('Soft manufactured edges', 'BEVEL')
    mod.width = bevel
    mod.segments = 5
    obj.modifiers.new('Weighted normals', 'WEIGHTED_NORMAL')
    obj.data.materials.append(mat)
    if parent:
        world = obj.matrix_world.copy()
        obj.parent = parent
        obj.matrix_world = world
    return obj

def joint(name, location):
    obj = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    return obj

rounded('Body', (0, 0, 1.8), (1.5, .95, 1.45), cream, .28)
rounded('Chest', (0, -.49, 1.9), (.77, .12, .66), teal, .15)
rounded('Chest badge', (0, -.58, 1.9), (.27, .08, .27), orange, .08)
head = joint('Head pivot', (0, 0, 2.65))
rounded('Head', (0, 0, 3.12), (1.88, 1.12, 1.2), cream, .28, head)
rounded('Face screen', (0, -.59, 3.16), (1.52, .14, .78), teal, .2, head)
for x in [-.39, .39]:
    rounded('Friendly eye', (x, -.69, 3.23), (.16, .09, .26), eye, .07, head)
rounded('Smile', (0, -.70, 2.99), (.38, .07, .07), eye, .033, head)
rounded('Antenna stem', (0, 0, 3.84), (.10, .10, .34), teal, .04, head)
bpy.ops.mesh.primitive_uv_sphere_add(segments=20, ring_count=12, radius=.16, location=(0, 0, 4.04))
bpy.context.object.data.materials.append(orange)
for x in [-.43, .43]:
    rounded('Leg', (x, 0, .77), (.31, .4, .7), teal, .13)
    rounded('Boot', (x, -.15, .36), (.58, .8, .35), orange, .13)
arm = joint('Teaching arm pivot', (-.83, 0, 2.36))
rounded('Teaching arm', (-1.13, 0, 1.97), (.36, .43, 1.0), teal, .16, arm)
rounded('Teaching hand', (-1.18, -.04, 1.45), (.48, .5, .45), cream, .18, arm)
rounded('Resting arm', (1.0, 0, 1.96), (.34, .43, 1.0), teal, .15)
rounded('Resting hand', (1.0, -.04, 1.43), (.48, .5, .45), cream, .18)
for frame, angle in [(1, -.12), (12, .08), (24, -.06), (36, 0)]:
    head.rotation_euler[1] = angle
    head.keyframe_insert(data_path='rotation_euler', frame=frame)
for frame, angle in [(1, 0), (12, -.8), (24, -.55), (36, -.8)]:
    arm.rotation_euler[1] = angle
    arm.keyframe_insert(data_path='rotation_euler', frame=frame)

scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.samples = 16
scene.cycles.use_denoising = True
scene.render.resolution_x = 600
scene.render.resolution_y = 750
scene.render.resolution_percentage = 100
scene.render.film_transparent = True
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'
scene.render.fps = 24
scene.frame_start, scene.frame_end = 1, 36
scene.world.color = (.5, .5, .5)
for location, energy, size in [((2, -5, 7), 650, 5), ((-4, -2, 4), 400, 4), ((1, 3, 6), 750, 3)]:
    bpy.ops.object.light_add(type='AREA', location=location)
    light = bpy.context.object
    light.data.energy, light.data.shape, light.data.size = energy, 'DISK', size
    light.rotation_euler = (Vector((0, 0, 2)) - light.location).to_track_quat('-Z', 'Y').to_euler()
bpy.ops.object.camera_add(location=(3.8, -11, 5.0))
scene.camera = bpy.context.object
scene.camera.rotation_euler = (Vector((-.1, 0, 2.2)) - scene.camera.location).to_track_quat('-Z', 'Y').to_euler()
scene.camera.data.type, scene.camera.data.ortho_scale = 'ORTHO', 5.25
scene.view_settings.view_transform = 'AgX'
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out, 'decimal-guide.blend'))
for frame, name in [(1, 'curious'), (18, 'pointing'), (36, 'settled')]:
    scene.frame_set(frame)
    scene.render.filepath = os.path.join(out, f'robot-{name}.png')
    bpy.ops.render.render(write_still=True)
# These frames exercise the reusable joint animation, rather than only a still render.
scene.render.resolution_percentage = 60
scene.cycles.samples = 8
scene.render.filepath = os.path.join(out, 'motion', 'robot-')
bpy.ops.render.render(animation=True)
