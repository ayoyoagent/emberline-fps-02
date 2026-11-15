#!/usr/bin/env python3
"""Model a REAL right hand gripping a rifle grip — Blender 4.0.2 headless.

Run (from assets/hand/):
  ~/workspace/tools/blender-4.0.2-linux-x64/blender --background --python model_hand.py
Out: hand.blend (editable source), hand.glb (archive),
     ../../game/src/hand.js (embedded mesh data, no fetch).

Hand frame (Blender, grip axis = Z, origin = grip centre):
  X = right, Y = gun-forward, Z = up.
Export converts to three.js model space: three(x,y,z) = blender(x, z, -y).

Anatomy (right hand, palm on the +X side of the grip, wrist from +X/-Y/-Z):
  - Palm: beveled cube, smooth-shaded, on the +X side of the grip.
  - 4 fingers, stacked along Z (index top, pinky bottom). Each wraps the
    FRONT (+Y) face of the grip in 3 tapered segments; joints are slightly
    larger spheres so the phalanges read as separate segments. The index
    reaches a touch more forward, toward the trigger.
  - Thumb: 2 segments up the -X side of the grip.
  - Wrist stub: tapered cylinder toward the sleeve.
Material: tan leather glove #6b5a48, roughness 0.9.
Budget: < 3000 tris. Export quantizes positions/normals to integers (x1000)
and drops UVs (the game uses a flat glove material) to keep hand.js small
enough for the dossier text cap.
"""
import json
import os

import bpy
from mathutils import Vector

OUT_DIR = os.path.dirname(os.path.abspath(__file__))
GAME_SRC = os.path.join(OUT_DIR, "..", "..", "game", "src")
BLEND_PATH = os.path.join(OUT_DIR, "hand.blend")
GLB_PATH = os.path.join(OUT_DIR, "hand.glb")
JS_PATH = os.path.join(GAME_SRC, "hand.js")

GLOVE_RGB = (0x6B / 255.0, 0x5A / 255.0, 0x48 / 255.0, 1.0)
SIDES = 8
SPH_SEG = 6
SPH_RING = 4


def clean_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()
    for block in list(bpy.data.meshes):
        bpy.data.meshes.remove(block)
    for block in list(bpy.data.materials):
        bpy.data.materials.remove(block)


def set_active(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def smooth_shade(obj):
    for poly in obj.data.polygons:
        poly.use_smooth = True


def apply_transforms(obj):
    set_active(obj)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)


def cylinder_between(p1, p2, r1, r2):
    a, b = Vector(p1), Vector(p2)
    d = b - a
    length = d.length
    mid = (a + b) / 2.0
    bpy.ops.mesh.primitive_cone_add(
        vertices=SIDES, radius1=r1, radius2=r2, depth=length, location=mid
    )
    obj = bpy.context.active_object
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(d.normalized())
    smooth_shade(obj)
    return obj


def sphere_at(p, r):
    bpy.ops.mesh.primitive_uv_sphere_add(
        segments=SPH_SEG, ring_count=SPH_RING, radius=r, location=p
    )
    obj = bpy.context.active_object
    smooth_shade(obj)
    return obj


def build_palm():
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0.048, 0.0, 0.0))
    palm = bpy.context.active_object
    palm.name = "Palm"
    palm.scale = (0.045, 0.095, 0.115)
    palm.rotation_euler = (0.06, 0.0, -0.04)
    bevel = palm.modifiers.new(name="Bevel", type="BEVEL")
    bevel.width = 0.013
    bevel.segments = 3
    set_active(palm)
    bpy.ops.object.modifier_apply(modifier=bevel.name)
    apply_transforms(palm)
    smooth_shade(palm)
    return palm


def build_finger(z_base, scale, radii, index_finger=False):
    p0 = Vector((0.036, -0.018, z_base))
    p1 = Vector((0.030, 0.030, z_base - 0.001))
    p2 = Vector((-0.010, 0.040, z_base - 0.003))
    if index_finger:
        p3 = Vector((-0.022, 0.030, z_base - 0.004))
    else:
        p3 = Vector((-0.030, 0.010, z_base - 0.005))
    pts = [p0, p1, p2, p3]
    for i in range(1, 4):
        pts[i] = p0 + (pts[i] - p0) * scale
    r_prox, r_mid, r_dist = radii
    parts = []
    parts.append(cylinder_between(pts[0], pts[1], r_prox, r_mid))
    parts.append(cylinder_between(pts[1], pts[2], r_mid, r_dist))
    parts.append(cylinder_between(pts[2], pts[3], r_dist, r_dist * 0.85))
    parts.append(sphere_at(pts[0], r_prox * 1.10))
    parts.append(sphere_at(pts[1], r_mid * 1.10))
    parts.append(sphere_at(pts[2], r_dist * 1.10))
    parts.append(sphere_at(pts[3], r_dist * 1.02))
    return parts


def build_thumb():
    t0 = Vector((0.030, -0.030, -0.018))
    t1 = Vector((-0.024, -0.030, 0.006))
    t2 = Vector((-0.040, -0.012, 0.032))
    parts = []
    parts.append(cylinder_between(t0, t1, 0.0125, 0.0105))
    parts.append(cylinder_between(t1, t2, 0.0105, 0.0095))
    parts.append(sphere_at(t0, 0.0125 * 1.05))
    parts.append(sphere_at(t1, 0.0105 * 1.10))
    parts.append(sphere_at(t2, 0.0095 * 1.02))
    return parts


def build_wrist():
    return [
        cylinder_between(
            (0.048, -0.005, -0.055), (0.100, -0.130, -0.125), 0.034, 0.030
        )
    ]


def make_material():
    mat = bpy.data.materials.new("GloveTan")
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = GLOVE_RGB
    bsdf.inputs["Roughness"].default_value = 0.9
    bsdf.inputs["Metallic"].default_value = 0.05
    return mat


def join_parts(parts):
    bpy.ops.object.select_all(action="DESELECT")
    for obj in parts:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    hand = bpy.context.active_object
    hand.name = "Hand_Right_Grip"
    return hand


def dump_json(obj):
    """Dump the mesh as a JS module, Blender -> three.js axis conversion
    applied (three(x,y,z) = blender(x, z, -y)). Positions/normals are
    quantized to integers (x1000) and UVs are dropped: the game uses a flat
    glove material, so UVs would only bloat the dossier.
    NOTE: MeshLoop.normal reads (0,0,0) on a freshly joined mesh in
    background mode — use the per-vertex normal instead (the whole hand is
    smooth-shaded, and joined parts keep their own vertices, so the vertex
    normal is the correct smooth normal)."""
    mesh = obj.data
    mesh.update()
    mesh.calc_loop_triangles()

    def cvt(v):
        return (round(v[0], 3), round(v[2], 3), round(-v[1], 3))

    verts = []
    index_of = {}
    indices = []
    for tri in mesh.loop_triangles:
        for loop_index in tri.loops:
            loop = mesh.loops[loop_index]
            v = mesh.vertices[loop.vertex_index]
            pos = cvt(v.co)
            nor = cvt(v.normal)
            key = (pos, nor)
            idx = index_of.get(key)
            if idx is None:
                idx = len(verts)
                index_of[key] = idx
                verts.append(key)
            indices.append(idx)

    positions, normals = [], []
    for pos, nor in verts:
        positions.extend(int(round(c * 1000)) for c in pos)
        normals.extend(int(round(c * 1000)) for c in nor)
    data = {
        "positions": positions,
        "normals": normals,
        "indices": indices,
        "triangles": len(mesh.loop_triangles),
        "vertices": len(verts),
    }
    js = (
        "// Right hand gripping a rifle grip, modelled in Blender 4.0.2\n"
        "// (assets/hand/model_hand.py) and baked into this module — no fetch,\n"
        "// no loader. Positions/normals are quantized integers (x1000) in\n"
        "// three.js model space (Blender Z-up -> three.js Y-up at export).\n"
        "export const HAND = " + json.dumps(data, separators=(",", ":")) + ";\n"
    )
    with open(JS_PATH, "w") as f:
        f.write(js)
    return data, len(js)


def main():
    clean_scene()
    parts = []
    parts.append(build_palm())
    fingers = [
        (0.040, 0.97, (0.0115, 0.0105, 0.0090), True),
        (0.022, 1.00, (0.0115, 0.0105, 0.0090), False),
        (0.004, 0.97, (0.0110, 0.0100, 0.0085), False),
        (-0.014, 0.85, (0.0100, 0.0090, 0.0080), False),
    ]
    for z_base, scale, radii, is_index in fingers:
        parts.extend(build_finger(z_base, scale, radii, is_index))
    parts.extend(build_thumb())
    parts.extend(build_wrist())

    hand = join_parts(parts)
    hand.data.materials.append(make_material())

    tri_count = len(hand.data.loop_triangles)
    print(f"HAND tris: {tri_count}")
    dims = hand.dimensions
    print(f"HAND bbox: {dims.x:.3f} x {dims.y:.3f} x {dims.z:.3f} m")

    data, js_bytes = dump_json(hand)
    print(f"HAND js module: {JS_PATH} ({js_bytes} bytes, "
          f"{data['vertices']} verts, {data['triangles']} tris)")

    bpy.ops.wm.save_as_mainfile(filepath=BLEND_PATH)
    print(f"HAND blend saved: {BLEND_PATH}")
    bpy.ops.export_scene.gltf(filepath=GLB_PATH, export_format="GLB")
    print(f"HAND glb saved: {GLB_PATH}")


main()
