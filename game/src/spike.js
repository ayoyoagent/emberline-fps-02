// The spike: a small device the Ember carrier plants at a site (hold E,
// 3.5 s) and Ashfall defuses (hold E, 5 s). Planting starts a 45 s timer;
// detonation wins the round for Ember, a defuse wins it for Ashfall.
// This module owns the visuals (device mesh, blinking light, site markers)
// and the two channels; the match machine in rounds.js owns the outcome.
import * as THREE from 'three';
import { createChannel, PLANT_TIME, DEFUSE_TIME } from './rounds.js';

export function createSpike(scene, sites) {
  const group = new THREE.Group();
  scene.add(group);

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.22, 0.26),
    new THREE.MeshStandardMaterial({ color: 0x2a2d31, roughness: 0.5, metalness: 0.5 }),
  );
  body.visible = false;
  group.add(body);
  const lamp = new THREE.Mesh(
    new THREE.SphereGeometry(0.05, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xff3020 }),
  );
  lamp.position.y = 0.14;
  lamp.visible = false;
  group.add(lamp);
  const beacon = new THREE.PointLight(0xff3020, 0, 6);
  group.add(beacon);

  // Site markers: a glowing ring on the ground at each plant zone.
  const markers = {};
  for (const [key, site] of Object.entries(sites)) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(site.r - 0.25, site.r, 40),
      new THREE.MeshBasicMaterial({ color: 0xf5a623, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(site.x, 0.03, site.z);
    group.add(ring);
    markers[key] = ring;
  }

  const plantChannel = createChannel(PLANT_TIME);
  const defuseChannel = createChannel(DEFUSE_TIME);
  let plantedSite = null;
  let plantedAt = 0;
  let blink = 0;

  return {
    group,
    plantChannel,
    defuseChannel,
    get plantedSite() {
      return plantedSite;
    },
    // The carrier's device rides on their back until planted; show it on
    // the ground at the site once planted.
    plant(siteKey, time) {
      plantedSite = siteKey;
      plantedAt = time;
      const site = sites[siteKey];
      body.position.set(site.x, 0.11, site.z);
      lamp.position.set(site.x, 0.25, site.z);
      beacon.position.set(site.x, 0.6, site.z);
      body.visible = true;
      lamp.visible = true;
      beacon.intensity = 2;
      markers[siteKey].material.color.set(0xff3020);
      markers[siteKey].material.opacity = 0.7;
    },
    reset() {
      plantedSite = null;
      body.visible = false;
      lamp.visible = false;
      beacon.intensity = 0;
      plantChannel.break();
      defuseChannel.break();
      for (const ring of Object.values(markers)) {
        ring.material.color.set(0xf5a623);
        ring.material.opacity = 0.35;
      }
    },
    update(dt, time) {
      if (!plantedSite) return;
      blink += dt;
      const on = Math.sin(blink * (plantedAt ? 9 : 4)) > 0;
      lamp.material.color.set(on ? 0xff3020 : 0x601008);
      beacon.intensity = on ? 2.5 : 0.6;
    },
  };
}
