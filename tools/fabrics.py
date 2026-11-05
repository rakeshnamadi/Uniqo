"""The Design Lobby's fabrics, built in Blender.

Run headless:  blender --background --python tools/fabrics.py [-- cotton,silk]

For each fabric it writes to public/assets/fabrics/:
  <key>.png         a seamless 6 cm tile for the lobby's shader: RG = thread relief (normal),
                    B = tone (0.5 is neutral), A = thread coverage (how much light the cloth stops)
  <key>-swatch.webp the same cloth rendered in Cycles on a folded sheet: neutral grey with real alpha,
                    so the page can dye it any colour and lay it over the customer's skin tone
"""
import math, os, sys
import bpy
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public", "assets", "fabrics")
SIZE = 256
TILE_M = .06                                     # metres of cloth in one tile (the shader must agree)
rng = np.random.default_rng(21)
yy, xx = np.meshgrid(np.arange(SIZE) / SIZE, np.arange(SIZE) / SIZE, indexing="ij")     # y = warp direction


def noise(fx, fy=None, band=.5):
    """seamless band-limited noise, 0..1: fx, fy = cycles per tile across and along"""
    fy = fx if fy is None else fy
    f = np.fft.fftfreq(SIZE, 1 / SIZE)
    u, v = np.meshgrid(f, f, indexing="xy")
    r = np.hypot(u / max(fx, 1e-3), v / max(fy, 1e-3))
    filt = np.exp(-((r - 1) / band) ** 2)
    n = np.fft.ifft2(np.fft.fft2(rng.standard_normal((SIZE, SIZE))) * filt).real
    return np.clip(.5 + n / (n.std() * 5 + 1e-9), 0, 1)


def plain(nx, ny=None):
    """plain weave relief, 0..1: threads pass over and under each other"""
    ny = nx if ny is None else ny
    a, b = np.sin(2 * math.pi * nx * xx), np.sin(2 * math.pi * ny * yy)
    return .5 + .5 * a * b


def twill(n):
    """3/1 twill: raised diagonal ribs"""
    t = (n * xx + n * yy) % 1.0
    return np.clip(1 - np.abs(t - .5) * 2.4, 0, 1) * (.8 + .2 * np.sin(2 * math.pi * n * 3 * (xx - yy)))


def holes(nx, ny, size):
    """open-weave gaps between threads (1 = thread, 0 = gap), softly antialiased"""
    gx = np.abs(((nx * xx) % 1.0) - .5) * 2
    gy = np.abs(((ny * yy) % 1.0) - .5) * 2
    return np.clip((np.maximum(1 - gx, 1 - gy) - size) / .22 + .5, 0, 1)


def recipe(key):
    """(relief, tone, coverage)"""
    flat = np.ones((SIZE, SIZE))
    if key == "cotton":
        return plain(30) * .8 + noise(90) * .2, .5 + (noise(5, 60) - .5) * .1, flat
    if key == "linen":
        w, f = noise(70, 2.5, .8), noise(2.5, 70, .8)                    # thick and thin threads, the slub
        return plain(22) * .55 + (w + f) * .3, .5 + (w + f - 1) * .5, flat
    if key == "denim":
        wash = noise(2.5, 4, .9)
        return twill(26), .5 + (twill(26) - .5) * .22 + (wash - .5) * .14 + (noise(3, 90, .7) - .5) * .1, flat
    if key == "rayon":
        return plain(46) * .4 + noise(4, 60) * .3, .5 + (noise(3, 50) - .5) * .08, flat
    if key == "crepe":
        pebble = noise(38, 38, .6)
        return pebble, .5 + (pebble - .5) * .22, flat
    if key == "georgette":
        crinkle = noise(16, 26, .7)
        return crinkle * .75 + plain(34) * .25, .5 + (crinkle - .5) * .26, .78 * holes(34, 34, .14) + .1 * crinkle
    if key == "chiffon":
        soft = noise(7, 12, .8)
        return soft * .55 + plain(40) * .25, .5 + (soft - .5) * .12, .62 * holes(40, 40, .22) + .06 * soft
    if key == "chanderi":
        return plain(44) * .5 + noise(3, 70) * .25, .5 + (noise(70, 3, .7) - .5) * .16, .74 * holes(44, 30, .18) + .1
    if key == "chikankari":
        return plain(36) * .7 + noise(70) * .2, .5 + (noise(40) - .5) * .08, .9 * holes(36, 36, .08) + .08
    if key == "silk":
        slub = noise(2.5, 44, .7)                                        # fine dupion lines across the cloth
        return plain(60) * .25 + slub * .35, .5 + (slub - .5) * .3, flat
    if key == "satin_silk":
        return noise(90, 3, .8) * .2, .5 + (noise(70, 2.5) - .5) * .05, flat
    if key == "space_silk":
        return plain(52) * .3 + noise(30) * .2, .5 + (noise(36) - .5) * .12, flat
    raise KeyError(key)


# how each fabric takes the light in the swatch render: roughness, sheen, anisotropy, relief, fold scale, fold height
LOOK = {"cotton": (.82, .25, 0, .35, 2.2, .010), "linen": (.88, .15, 0, .55, 1.6, .014), "denim": (.8, .08, 0, .6, 1.3, .017),
        "rayon": (.45, .3, .3, .15, 3.4, .012), "crepe": (.72, .25, 0, .55, 2.4, .009), "georgette": (.62, .35, 0, .5, 3.8, .012),
        "chiffon": (.5, .4, 0, .25, 4.6, .014), "chanderi": (.42, .35, .3, .25, 3, .010), "chikankari": (.78, .3, 0, .3, 2.6, .009),
        "silk": (.3, .4, .6, .2, 3, .013), "satin_silk": (.16, .3, .85, .05, 2.6, .015), "space_silk": (.28, .5, .4, .2, 3.2, .012)}


def write_tile(key):
    h, tone, cov = recipe(key)
    h = (h - h.min()) / max(h.max() - h.min(), 1e-6)
    dx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * 2.2
    dy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * 2.2
    rgba = np.dstack([np.clip(.5 - dx * .5, 0, 1), np.clip(.5 - dy * .5, 0, 1), np.clip(tone, 0, 1), np.clip(cov, 0, 1)]).astype(np.float32)
    img = bpy.data.images.new(key, SIZE, SIZE, alpha=True)
    img.colorspace_settings.name = "Non-Color"
    img.alpha_mode = "CHANNEL_PACKED"
    img.pixels.foreach_set(rgba[::-1].ravel())                           # Blender's rows run bottom-up
    img.filepath_raw = os.path.join(OUT, key + ".png")
    img.file_format = "PNG"
    img.save()
    return img, float(cov.mean())


def folded_sheet(amp, freq):
    n = 220
    verts, faces, uvs = [], [], []
    for j in range(n + 1):
        for i in range(n + 1):
            x, y = i / n - .5, j / n - .5
            # soft folds running down the cloth, wandering a little
            ph = 2 * math.pi * freq * x + 1.2 * math.sin(y * 3.4 + 1)
            z = amp * (math.sin(ph) + .4 * math.sin(ph * 2.3 + 1.1))
            verts.append((x * .14, y * .14, z))
    for j in range(n):
        for i in range(n):
            a = j * (n + 1) + i
            faces.append((a, a + 1, a + n + 2, a + n + 1))
    me = bpy.data.meshes.new("sheet")
    me.from_pydata(verts, [], faces)
    me.update()
    uv = me.uv_layers.new(name="UVMap")
    for f in me.polygons:
        f.use_smooth = True
        for li in f.loop_indices:
            v = verts[me.loops[li].vertex_index]
            uv.data[li].uv = (v[0] / TILE_M, v[1] / TILE_M)
    ob = bpy.data.objects.new("sheet", me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def fabric_material(key, img):
    rough, sheen, aniso, relief, _, _ = LOOK[key]
    m = bpy.data.materials.new(key)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = img
    tex.interpolation = "Cubic"
    sep = nt.nodes.new("ShaderNodeSeparateColor")
    nt.links.new(tex.outputs["Color"], sep.inputs[0])
    # relief -> normal
    com = nt.nodes.new("ShaderNodeCombineColor")
    nt.links.new(sep.outputs[0], com.inputs[0])
    nt.links.new(sep.outputs[1], com.inputs[1])
    com.inputs[2].default_value = 1
    nm = nt.nodes.new("ShaderNodeNormalMap")
    nm.inputs["Strength"].default_value = relief * 2
    nt.links.new(com.outputs[0], nm.inputs["Color"])
    nt.links.new(nm.outputs[0], bsdf.inputs["Normal"])
    # neutral grey cloth; tone darkens and lifts it (the page dyes it with hard-light)
    mul = nt.nodes.new("ShaderNodeMath")
    mul.operation = "MULTIPLY"
    mul.inputs[1].default_value = .42
    add = nt.nodes.new("ShaderNodeMath")
    add.operation = "ADD"
    add.inputs[1].default_value = .02
    nt.links.new(sep.outputs[2], mul.inputs[0])
    nt.links.new(mul.outputs[0], add.inputs[0])
    nt.links.new(add.outputs[0], bsdf.inputs["Base Color"])
    nt.links.new(tex.outputs["Alpha"], bsdf.inputs["Alpha"])
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Sheen Weight"].default_value = sheen
    bsdf.inputs["Anisotropic"].default_value = aniso
    return m


def render_swatch(key, img):
    for ob in list(bpy.data.objects):
        if ob.name.startswith("sheet"):
            bpy.data.objects.remove(ob)
    amp_f = LOOK[key]
    ob = folded_sheet(amp_f[5], amp_f[4])
    ob.data.materials.append(fabric_material(key, img))
    sc = bpy.context.scene
    sc.render.filepath = os.path.join(OUT, key + "-swatch.webp")
    bpy.ops.render.render(write_still=True)


def setup_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.samples = 96
    sc.cycles.use_denoising = False
    sc.cycles.transparent_max_bounces = 16
    sc.render.film_transparent = True
    sc.render.resolution_x = sc.render.resolution_y = 200
    sc.render.image_settings.file_format = "WEBP"
    sc.render.image_settings.color_mode = "RGBA"
    sc.render.image_settings.quality = 88
    sc.view_settings.view_transform = "Standard"
    sc.world = bpy.data.worlds.new("w")
    sc.world.use_nodes = True
    sc.world.node_tree.nodes["Background"].inputs[0].default_value = (1, 1, 1, 1)
    sc.world.node_tree.nodes["Background"].inputs[1].default_value = .3
    light = bpy.data.lights.new("key", "AREA")
    light.size, light.energy = .25, 1.1
    lo = bpy.data.objects.new("key", light)
    lo.location = (-.14, .1, .26)
    lo.rotation_euler = (-.3, -.45, 0)
    sc.collection.objects.link(lo)
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = .12
    cam.location = (0, 0, .5)
    sc.collection.objects.link(cam)
    sc.camera = cam


def main():
    os.makedirs(OUT, exist_ok=True)
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    keys = args[0].split(",") if args else list(LOOK)
    setup_scene()
    for key in keys:
        img, cov = write_tile(key)
        render_swatch(key, img)
        print(f"fabric {key}: coverage {cov:.2f}, tile {os.path.getsize(os.path.join(OUT, key + '.png')) / 1e3:.0f} KB, "
              f"swatch {os.path.getsize(os.path.join(OUT, key + '-swatch.webp')) / 1e3:.0f} KB")


main()
