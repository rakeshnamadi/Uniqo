"""Garments for the Design Lobby, tailored on the Uniqo body and draped with Blender's cloth simulation.

Called by make_avatar.py (with --garments) while the posed body still has its rig and skin weights:
  bodice  - cut from the body's own surface between the waist seam and the neck, eased over the bust
            and held a few millimetres off the skin; armholes follow the arm weights
  skirt   - a flared panel pinned at the waist seam and dropped under gravity, colliding with hips,
            legs and hands, so the folds are real
  sleeves - cut from the arm surface to each length, measured along the real shoulder-elbow-wrist line

Every piece carries two UV sets in the lobby's convention (see loft() in lobby-3d.js):
  TEXCOORD_0 = (u around the body 0..1 with 0.5 at the front centre, v 0..1 top -> bottom)
  TEXCOORD_1 = (arc metres from the front centre, metres down from the piece's top)
so fabric textures, borders, hems and the live neckline cut keep working on the draped cloth.
"""
import math, os, re
import bpy, bmesh
from mathutils import Vector
from mathutils.bvhtree import BVHTree

LOBBY_H = 1.69                                   # the lobby normalises the body to this height
ARM_RE = re.compile(r"(upperarm|lowerarm|wrist|finger|metacarpal|thumb|hand)", re.I)


class Body:
    def __init__(self, obj, rig):
        self.obj, me = obj, obj.data
        self.co = [obj.matrix_world @ v.co for v in me.vertices]
        zs = [p.z for p in self.co]
        self.z0, self.H = min(zs), max(zs) - min(zs)
        self.k = LOBBY_H / self.H                                        # blender metres -> lobby metres
        arm_groups = {g.index for g in obj.vertex_groups if ARM_RE.search(g.name)}
        self.armw = [sum(g.weight for g in v.groups if g.group in arm_groups) for v in me.vertices]
        bone = lambda n, tail=False: rig.matrix_world @ (rig.pose.bones[n].tail if tail else rig.pose.bones[n].head)
        self.arm = {s: (bone("upperarm01." + s), bone("lowerarm01." + s), bone("lowerarm02." + s, True)) for s in ("L", "R")}
        self.bvh = BVHTree.FromObject(obj, bpy.context.evaluated_depsgraph_get())
        # torso cross-sections (edges cut by a height plane, arms left out), cached per 5 mm
        tor = [e.vertices for e in me.edges if self.armw[e.vertices[0]] < .3 and self.armw[e.vertices[1]] < .3]
        self.buckets = {}
        for a, b in tor:
            za, zb = self.co[a].z, self.co[b].z
            for i in range(int((min(za, zb) - self.z0) / .005), int((max(za, zb) - self.z0) / .005) + 1):
                self.buckets.setdefault(i, []).append((a, b))
        self.cache = {}
        print("arm groups:", sorted(g.name for g in obj.vertex_groups if g.index in arm_groups)[:6], "...")

    def z(self, y):                                                      # lobby height -> blender z
        return self.z0 + y / self.k

    def y(self, z):
        return (z - self.z0) * self.k

    def band(self, z):
        """outline points of the torso cross-section at blender height z"""
        i = round((z - self.z0) / .005)
        if i not in self.cache:
            zz, pts = self.z0 + i * .005, []
            for a, b in self.buckets.get(i, []):
                pa, pb = self.co[a], self.co[b]
                if (pa.z < zz) != (pb.z < zz):
                    pts.append(pa.lerp(pb, (zz - pa.z) / (pb.z - pa.z)))
            self.cache[i] = pts
        return self.cache[i]

    def centre_y(self, z):
        b = self.band(z)
        return (min(p.y for p in b) + max(p.y for p in b)) / 2 if b else 0.0

    def half_width(self, z):
        b = self.band(z)
        return max((abs(p.x) for p in b), default=0.0)

    def landmarks(self):
        """neck base, natural waist (narrowest torso) in lobby heights"""
        ys = [i * .005 for i in range(int(1.2 / .005), int(1.6 / .005))]
        neck = min((self.half_width(self.z(y)), y) for y in ys if 1.42 < y < 1.56)
        base = max(y for y in ys if y < neck[1] and self.half_width(self.z(y)) >= 1.5 * neck[0])
        waist = min((self.half_width(self.z(y)), y) for y in [i * .005 for i in range(200, 240)])[1]
        print("half-widths:", [(round(y, 3), round(self.half_width(self.z(y)) * self.k, 3)) for y in [i * .02 for i in range(45, 72)]])
        return {"neck_base": base, "waist": waist}

    def push_out(self, verts, gap):
        """move every vertex that sits inside the body (or closer than gap) out to gap above the skin"""
        for v in verts:
            hit = self.bvh.find_nearest(v.co)
            if hit[0] is None:
                continue
            loc, nor = hit[0], hit[1]
            d = (v.co - loc).dot(nor)
            if d < gap:
                v.co = loc + nor * gap


def angle_u(x, y_back, cy):
    """u around the body: 0.5 at the front centre (the body faces -Y), increasing towards +X"""
    return (math.atan2(x, -(y_back - cy)) + math.pi) / (2 * math.pi)


def set_uvs(obj, uv_of):
    """uv_of(vertex co, face) -> (u, v, arc, down); fixes the u seam at the back"""
    me = obj.data
    while me.uv_layers:                                                  # drop the body's own UV map (cut pieces inherit it)
        me.uv_layers.remove(me.uv_layers[0])
    a = me.uv_layers.new(name="UVMap")
    b = me.uv_layers.new(name="UVArc")
    for f in me.polygons:
        vals = [uv_of(me.vertices[me.loops[li].vertex_index].co) for li in f.loop_indices]
        us = [q[0] for q in vals]
        if max(us) - min(us) > .5:                                      # face straddles the back seam
            vals = [(q[0] + 1 if q[0] < .5 else q[0], q[1], q[2] + (q[4] if q[0] < .5 else 0), q[3], q[4]) for q in vals]
        for li, q in zip(f.loop_indices, vals):
            a.data[li].uv = (q[0], q[1])
            b.data[li].uv = (q[2], q[3])


def cut_from_body(body, name, keep, gap, smooth=8):
    """a new object made of the body faces where keep(face centroid, mean arm weight, verts) is true"""
    bm = bmesh.new()
    bm.from_mesh(body.obj.data)
    bm.transform(body.obj.matrix_world)
    bm.verts.ensure_lookup_table()
    gone = [f for f in bm.faces if not keep(f.calc_center_median(), sum(body.armw[v.index] for v in f.verts) / len(f.verts), f.verts)]
    bmesh.ops.delete(bm, geom=gone, context="FACES_ONLY")
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    bm.normal_update()
    for v in bm.verts:                                                   # ease off the skin along the normals
        v.co += v.normal * gap
    edge = [v for v in bm.verts if v.is_boundary]
    for _ in range(smooth):                                              # bridge hollows (between the breasts), keep the edges
        bmesh.ops.smooth_vert(bm, verts=[v for v in bm.verts if not v.is_boundary], factor=.5,
                              use_axis_x=True, use_axis_y=True, use_axis_z=True)
        body.push_out(bm.verts, gap)
    for _ in range(6):                                                   # tidy the cut edges into smooth curves
        for v in edge:
            nb = [e.other_vert(v) for e in v.link_edges if e.is_boundary]
            if len(nb) == 2:
                v.co = v.co.lerp((nb[0].co + nb[1].co) / 2, .5)
    body.push_out(bm.verts, gap)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.validate()
    obj = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def bodice(body, lm, end_y):
    top = lm["neck_base"] + .045                                         # the shader cuts each neckline below this
    zt, zw = body.z(top), body.z(end_y)
    obj = cut_from_body(body, "bodice", lambda c, w, vs: w < .35 and zw < c.z < zt, gap=.004)
    def uv(p):
        cy = body.centre_y(p.z)
        u = angle_u(p.x, p.y, cy)
        hw = max(body.half_width(p.z), .05)
        circ = math.pi * 1.6 * hw * 2                                     # ellipse-ish girth for arc metres
        return (u, (zt - p.z) / (zt - zw), (u - .5) * circ * body.k, (zt - p.z) * body.k, circ * body.k)
    set_uvs(obj, uv)
    obj["neckTop"] = round(top, 4)
    return obj


def sleeves(body, kind):
    """both sleeves of one style, cut from the arms: ends measured along shoulder -> wrist"""
    ends = {"cap": .2, "elbow": .5, "three": .74, "full": .97, "bell": .95}
    t_end = ends[kind]
    def t_of(p):
        s = "L" if p.x > 0 else "R"
        sh, el, wr = body.arm[s]
        ax = wr - sh
        return (p - sh).dot(ax) / ax.length_squared, s
    obj = cut_from_body(body, "sleeve-" + kind, lambda c, w, vs: w >= .35 and t_of(c)[0] < t_end, gap=.006, smooth=4)
    me = obj.data
    if kind == "bell":                                                   # flare out from the forearm
        for v in me.vertices:
            t, s = t_of(v.co)
            if t > .5:
                sh, el, wr = body.arm[s]
                ax = (wr - sh).normalized()
                foot = sh + ax * (v.co - sh).dot(ax)
                v.co += (v.co - foot).normalized() * .1 * ((t - .5) / .45) ** 2
    def uv(p):
        t, s = t_of(p)
        sh, el, wr = body.arm[s]
        ax = (wr - sh).normalized()
        foot = sh + ax * (p - sh).dot(ax)
        r = p - foot
        ang = math.atan2(r.x * (1 if s == "L" else -1), -r.y)
        u = (ang + math.pi) / (2 * math.pi)
        circ = 2 * math.pi * .045
        L = (wr - sh).length
        return (u, t / t_end, (u - .5) * circ * body.k, t * L * body.k, circ * body.k)
    set_uvs(obj, uv)
    return obj


def skirt(body, waist_y, hem_y, hem_half, *, frames=90, soft=.6, yoke_m=.07, sim=True, ease=.016):
    """flared skirt pinned at the waist seam, draped by gravity"""
    seg, R = 128, 56
    hem_half /= body.k                                                   # lobby metres -> blender metres
    zt = body.z(waist_y + .012)
    L = (body.z(waist_y) - body.z(hem_y))                               # cloth length from seam to hem
    # waist profile: body radius per angle around the torso centre (+ ease)
    cy = body.centre_y(zt)
    pts = body.band(zt)                                                  # torso only - the hands hang beside it
    prof = []
    for j in range(seg):
        th = 2 * math.pi * j / seg
        d = Vector((math.sin(th), -math.cos(th), 0))                    # j = seg/2 -> back... rotate so u=.5 is front
        best = 0
        for p in pts:
            q = Vector((p.x, p.y - cy, 0))
            if q.length > 1e-6 and q.normalized().dot(d) > math.cos(math.pi * 2.5 / seg):
                best = max(best, q.length)
        prof.append(best + .014)
    prof = [(prof[j - 1] + 2 * prof[j] + prof[(j + 1) % seg]) / 4 for j in range(seg)]
    arm_pts = [(p.z, math.hypot(p.x, p.y - cy), math.atan2(p.x, -(p.y - cy))) for p, w in zip(body.co, body.armw) if w > .5]
    def inside_arms(z, th):
        a = math.atan2(math.sin(th), math.cos(th))
        near = [r for pz, r, pa in arm_pts if abs(pz - z) < .03 and abs(math.atan2(math.sin(pa - a), math.cos(pa - a))) < .45]
        return min(near) - .025 if near else 9.0
    # rings by arc length, flaring towards hem_half (cone panels fall vertical under gravity and fold)
    ts = [i / (R - 1) for i in range(R)]
    ds = L / (R - 1)
    yoke = yoke_m / max(L, .1)                                              # a short fitted yoke, then the flare opens
    want = [[prof[j] + (hem_half - prof[j]) * max(0.0, (t - yoke) / (1 - yoke)) ** .9 for j in range(seg)] for t in ts]
    # where the arms hang, scale each ring's flare so it passes just inside them (no pinched panels) ...
    kf = []
    for i, t in enumerate(ts):
        zi, k = zt - L * t * .9, 1.0                                     # zi: roughly where this ring will hang
        for j in range(0, seg, 4):
            cap = inside_arms(zi, 2 * math.pi * j / seg)
            if cap < 9 and want[i][j] > prof[j]:
                k = min(k, max(0.0, (cap - prof[j]) / (want[i][j] - prof[j])))
        kf.append(k)
    # ... and let that limit ease in and out over the rings, so the panel starts as one smooth curve
    kf = [min(kf[j] + abs(i - j) * .035 for j in range(R)) for i in range(R)]
    radii = [[prof[j] + (want[i][j] - prof[j]) * kf[i] for j in range(seg)] for i in range(R)]
    # never start inside the body below the seam (belly, hips, seat): clear it at each ring's own height
    zz = zt
    for i in range(1, R):
        zz -= ds * .8
        pts_i = body.band(zz)
        if not pts_i:
            continue
        for j in range(seg):
            th = 2 * math.pi * j / seg
            d = (math.sin(th), -math.cos(th) * .92)                      # the ring's own (slightly flattened) direction
            reach = max((p.x * d[0] + (p.y - cy) * d[1]) / (d[0] ** 2 + d[1] ** 2) for p in pts_i)   # convex outline: cloth bridges hollows
            radii[i][j] = max(radii[i][j], reach + ease)
    if not sim:                                                          # fitted pieces: smooth the outline down the length
        for _ in range(6):
            radii = [[(radii[max(i - 1, 0)][j] + 2 * radii[i][j] + radii[min(i + 1, R - 1)][j]) / 4 if i else radii[i][j]
                      for j in range(seg)] for i in range(R)]
            radii = [[(r[j - 2] + 2 * r[j - 1] + 3 * r[j] + 2 * r[(j + 1) % seg] + r[(j + 2) % seg]) / 9 for j in range(seg)] for r in radii]
            radii = [[max(radii[i][j], prof[j] if i == 0 else 0) for j in range(seg)] for i in range(R)]
    verts, rows, s_of = [], [], []
    z = zt
    for i in range(R):
        if i:                                                            # rings spaced by cloth length (the slant)
            dr = max(abs(radii[i][j] - radii[i - 1][j]) for j in range(0, seg, 8))
            z -= math.sqrt(max(ds * ds - dr * dr, (ds * .6) ** 2))
        row = []
        for j in range(seg):
            th, r = 2 * math.pi * j / seg, radii[i][j]
            row.append(len(verts))
            verts.append((r * math.sin(th), cy - r * math.cos(th) * .92, z))
        rows.append(row)
        s_of.append(ds * i)
    faces = [(rows[i][j], rows[i][(j + 1) % seg], rows[i + 1][(j + 1) % seg], rows[i + 1][j]) for i in range(R - 1) for j in range(seg)]
    me = bpy.data.meshes.new("skirt")
    me.from_pydata(verts, [], faces)
    me.update()
    obj = bpy.data.objects.new("skirt", me)
    bpy.context.scene.collection.objects.link(obj)
    # uvs from the flat (rest) pattern, before the drape
    circ = [sum((Vector(verts[rows[i][(j + 1) % seg]]) - Vector(verts[rows[i][j]])).length for j in range(seg)) for i in range(R)]
    ring_of = {k: (i, j) for i, row in enumerate(rows) for j, k in enumerate(row)}
    a, b = me.uv_layers.new(name="UVMap"), me.uv_layers.new(name="UVArc")
    for f in me.polygons:                                                # column 0 is the front centre (u = .5)
        ij = [ring_of[me.loops[li].vertex_index] for li in f.loop_indices]
        us = [(j / seg + .5) % 1.0 for _, j in ij]
        if max(us) - min(us) > .5:                                       # the back seam
            us = [u + 1 if u < .5 else u for u in us]
        for li, (i, _), u in zip(f.loop_indices, ij, us):
            a.data[li].uv = (u, i / (R - 1))
            b.data[li].uv = ((u - .5) * circ[i] * body.k, s_of[i] * body.k)
    # pin the waistband
    pin = obj.vertex_groups.new(name="pin")
    pin.add(rows[0], 1.0, "REPLACE")
    for i in range(1, R):
        w = 1 - s_of[i] / max(yoke_m, .03)
        if w <= 0:
            break
        pin.add(rows[i], w * .8, "REPLACE")                              # the yoke stays close to the body
    if not sim:
        obj.vertex_groups.clear()
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.select_all(action="DESELECT")
        obj.select_set(True)
        bpy.ops.object.shade_smooth()
        return obj
    # colliders: the body and the floor
    col = body.obj.modifiers.new("Collision", "COLLISION")
    body.obj.collision.thickness_outer = .006
    body.obj.collision.cloth_friction = 1.5
    bpy.ops.mesh.primitive_plane_add(size=4, location=(0, 0, body.z0))
    floor = bpy.context.active_object
    floor.modifiers.new("Collision", "COLLISION")
    cl = obj.modifiers.new("Cloth", "CLOTH")
    st = cl.settings
    st.quality = 8
    st.mass = .25
    st.tension_stiffness = st.compression_stiffness = 12
    st.shear_stiffness = 6
    st.bending_stiffness = soft
    st.air_damping = 1.5
    st.vertex_group_mass = "pin"
    st.pin_stiffness = 1.0
    cs = cl.collision_settings
    cs.distance_min = .005
    cs.use_self_collision = True
    cs.self_distance_min = .004
    cl.point_cache.frame_start, cl.point_cache.frame_end = 1, frames
    scn = bpy.context.scene
    scn.frame_start, scn.frame_end = 1, frames
    for fr in range(1, frames + 1):
        scn.frame_set(fr)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.ops.object.modifier_apply(modifier="Cloth")
    body.obj.modifiers.remove(col)
    bpy.data.objects.remove(floor)
    obj.vertex_groups.clear()
    bpy.ops.object.shade_smooth()
    return obj


def export(objs, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
        if not o.data.materials:
            m = bpy.data.materials.get("fabric") or bpy.data.materials.new("fabric")
            o.data.materials.append(m)
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_yup=True, export_apply=True,
                              export_extras=True, export_animations=False, export_skins=False, export_morph=False,
                              export_draco_mesh_compression_enable=False)
    print(f"garment {os.path.basename(path)}: {sum(len(o.data.vertices) for o in objs)} verts, {os.path.getsize(path) / 1e3:.0f} KB")
    for o in objs:
        bpy.data.objects.remove(o)


# silhouette recipes (lobby metres; "waist" = skirt seam and "end" = bodice hem, both relative to the natural
# waist; "hem" = hem half-width for a floor-length cut; "soft" = cloth bending stiffness; "yoke" = fitted drop)
SILS = {
    "anarkali": {"waist": .02, "end": .01, "hem": .62, "soft": 8, "yoke": .07, "lens": ("knee", "midi", "ankle", "floor")},
    "aline":    {"waist": 0, "end": -.01, "hem": .42, "soft": 12, "yoke": .1, "lens": ("knee", "midi", "ankle", "floor")},
    "sheath":   {"waist": 0, "end": -.01, "hem": .17, "soft": 6, "yoke": .3, "sim": False, "ease": .014, "lens": ("knee", "midi", "ankle", "floor")},
    "kurta":    {"waist": 0, "end": -.01, "hem": .23, "soft": 10, "yoke": .2, "sim": False, "ease": .026, "lens": ("knee", "midi", "ankle", "floor")},
    "lehenga":  {"waist": -.04, "end": .07, "hem": .72, "soft": 3, "yoke": .1, "lens": ("ankle", "floor")},
    "saree":    {"waist": -.04, "end": .07, "hem": .24, "soft": 2, "yoke": .15, "lens": ("floor",)},
}
HEMS = {"knee": .48, "midi": .3, "ankle": .1, "floor": .03}
KURTA_HEMS = {"knee": .52, "midi": .45, "ankle": .37, "floor": .3}       # a kurta's own hem; the trousers take the length


def build_all(body_obj, rig, out_dir, only=None):
    body = Body(body_obj, rig)
    lm = body.landmarks()
    print("landmarks (lobby m):", {k: round(v, 3) for k, v in lm.items()})
    for sil, spec in SILS.items():
        for ln in spec["lens"]:
            if only and f"{sil}-{ln}" not in only and sil not in only:
                continue
            hem_y = (KURTA_HEMS if sil == "kurta" else HEMS)[ln]
            w = lm["waist"] + spec["waist"]
            hem = spec["hem"] * (w - hem_y) / (w - .03) if sil not in ("sheath", "saree") else spec["hem"]
            parts = [bodice(body, lm, lm["waist"] + spec["end"]),
                     skirt(body, w, hem_y, hem, soft=spec["soft"], yoke_m=spec["yoke"], sim=spec.get("sim", True), ease=spec.get("ease", .016))]
            export(parts, os.path.join(out_dir, f"{sil}-{ln}.glb"))
    if not only or "sleeves" in only:
        export([sleeves(body, k) for k in ("cap", "elbow", "three", "full", "bell")], os.path.join(out_dir, "sleeves.glb"))
