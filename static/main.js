import {loadGLTF} from "./libs/loader.js";
import {mockWithVideo} from './libs/camera-mock.js';
const THREE = window.MINDAR.IMAGE.THREE;

document.addEventListener('DOMContentLoaded', () => {
  const start = async() => {
    //mockWithVideo('../../assets/mock-videos/musicband1.mp4');

    const mindarThree = new window.MINDAR.IMAGE.MindARThree({
      container: document.body,
      imageTargetSrc: '/static/assets/targets/carnet.mind',
    });
    const {renderer, scene, camera} = mindarThree;

    const light = new THREE.HemisphereLight( 0xffffff, 0xbbbbff, 1 );
    scene.add(light);

    //const raccoon = await loadGLTF('/static/assets/models/musicband-raccoon/scene.gltf');
    const raccoon = await loadGLTF('/static/assets/models/upch-dia/images (1).gltf');
    //                      X     Y    Z
    raccoon.scene.scale.set(0.01, 0.01, 0.01);
    //                         X    Y   Z
    raccoon.scene.position.set(0, -0.4, 0);


    const anchor = mindarThree.addAnchor(0);
    anchor.group.add(raccoon.scene);

    await mindarThree.start();
    renderer.setAnimationLoop(() => {
      renderer.render(scene, camera);
    });
  }
  start();
});
