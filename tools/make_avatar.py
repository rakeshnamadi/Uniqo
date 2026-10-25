"""Build the lobby's base body with MPFB2 and export it as public/assets/avatar/uniqo-body.glb.

Run headless (Blender 4.2+ with the MPFB extension installed):
    blender --background --python tools/make_avatar.py [-- out.glb]
    (install MPFB once with: blender --online-mode -c extension install mpfb --enable)

The body is MPFB's CC0 base mesh: female, ~25, standing with the arms ~22 degrees from the
body, no clothes, hair, eyes or textures (the lobby adds hair, tints the skin and dresses her).
"""
import math, os, sys
import bpy, addon_utils
from mathutils import Vector

ARM_ANGLE = 22.0                                  # degrees between the upper arm and the body
OUT = sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv[:-1] else os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "public", "assets", "avatar", "uniqo-body.glb")

addon_utils.enable("bl_ext.blender_org.mpfb", default_set=True)
from bl_ext.blender_org.mpfb.services.humanservice import HumanService      # noqa: E402
from bl_ext.blender_org.mpfb.services.targetservice import TargetService    # noqa: E402

bpy.ops.wm.read_factory_settings(use_empty=True)
macros = {"gender": 0.0, "age": 0.5, "muscle": 0.5, "weight": 0.45, "proportions": 0.85, "height": 0.5,
          "cupsize": 0.5, "firmness": 0.5, "race": {"asian": 0.6, "caucasian": 0.3, "african": 0.1}}
body = HumanService.create_human(macro_detail_dict=macros)                     # keeps the joint-* helpers the rig is fitted from
body.name = "UniqoBody"

# pose the arms down to ARM_ANGLE with the default rig, then bake the pose into the mesh
rig = HumanService.add_builtin_rig(body, "default", import_weights=True)
bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode="POSE")
to_arm = rig.matrix_world.inverted().to_3x3()
for side in ("L", "R"):
    pb, wrist = rig.pose.bones["upperarm01." + side], rig.pose.bones["lowerarm02." + side]
    for _ in range(4):                            # turn the shoulder so shoulder -> wrist points ARM_ANGLE off vertical, in the front plane
        bpy.context.view_layer.update()
        cur = (wrist.tail - pb.head).normalized()
        sx = 1 if (rig.matrix_world.to_3x3() @ cur).x > 0 else -1
        tgt = (to_arm @ Vector((sx * math.sin(math.radians(ARM_ANGLE)), 0, -math.cos(math.radians(ARM_ANGLE))))).normalized()
        m = pb.matrix.copy(); head = m.translation.copy()
        m = cur.rotation_difference(tgt).to_matrix().to_4x4() @ m
        m.translation = head
        pb.matrix = m
    bpy.context.view_layer.update()
    v = rig.matrix_world.to_3x3() @ (wrist.tail - pb.head)
    print(f"arm {side}: {math.degrees(math.atan2(abs(v.x), -v.z)):.1f} deg out, {math.degrees(math.atan2(v.y, -v.z)):.1f} deg fwd")
bpy.ops.object.mode_set(mode="OBJECT")

# bake the body-shape targets, then apply the modifiers (helper mask + pose) so the export is a plain posed mesh
bpy.context.view_layer.objects.active = body
TargetService.bake_targets(body)
for m in list(body.modifiers):
    bpy.ops.object.modifier_apply(modifier=m.name)
body.parent = None
bpy.data.objects.remove(rig)
for vg in list(body.vertex_groups):
    body.vertex_groups.remove(vg)

# soften the anatomical detail at the bust apex so sheer fabrics stay tasteful (local Laplacian smoothing)
me = body.data
zs = [v.co.z for v in me.vertices]; z0, h = min(zs), max(zs) - min(zs)
nbr = [[] for _ in me.vertices]
for e in me.edges:
    a, b = e.vertices; nbr[a].append(b); nbr[b].append(a)
for sx in (1, -1):
    chest = [v for v in me.vertices if .7 < (v.co.z - z0) / h < .8 and .03 < sx * v.co.x < .16]
    apex = min(chest, key=lambda v: v.co.y).co.copy()                     # most forward point (the body faces -Y)
    sel = {v.index: 1 - (v.co - apex).length / .032 for v in me.vertices if (v.co - apex).length < .032}
    for _ in range(25):
        new = {i: sum((me.vertices[j].co for j in nbr[i]), Vector()) / len(nbr[i]) for i in sel}
        for i, w in sel.items():
            me.vertices[i].co = me.vertices[i].co.lerp(new[i], .6 * min(1, w * 1.6))
me.update()

# one plain skin material (the lobby tints it to the chosen skin tone)
body.data.materials.clear()
mat = bpy.data.materials.new("skin")
mat.use_nodes = True
bsdf = mat.node_tree.nodes.get("Principled BSDF")
bsdf.inputs["Base Color"].default_value = (0.80, 0.60, 0.50, 1)
bsdf.inputs["Roughness"].default_value = 0.6
body.data.materials.append(mat)
bpy.ops.object.shade_smooth()

os.makedirs(os.path.dirname(OUT), exist_ok=True)
bpy.ops.object.select_all(action="DESELECT")
body.select_set(True)
bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", use_selection=True, export_yup=True, export_apply=True,
                          export_animations=False, export_skins=False, export_morph=False, export_draco_mesh_compression_enable=False)
dims = body.dimensions
print(f"exported {OUT}: {len(body.data.vertices)} verts, {dims.z:.3f} m tall, {os.path.getsize(OUT) / 1e6:.2f} MB")
