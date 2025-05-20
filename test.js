import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

document.addEventListener('DOMContentLoaded', () => {
    const modelGrid = document.querySelector('.model-grid');
    const modelViewerContainer = document.getElementById('model-viewer');
    const closeViewer = document.getElementById('close-viewer');
    const spinner = document.getElementById('spinner');
    const categoryButtons = document.querySelectorAll('.button');
    const threeCanvasContainer = document.getElementById('three-canvas-container');

    const pageName = document.body.getAttribute('data-page');
    const jsonUrl = `https://raw.githubusercontent.com/Msciciel55/vermis-katalog/refs/heads/main/assets/dane/${pageName}.json`;
    let models = [];

    // --- Three.js Setup for Main Viewer ---
    let scene, camera, renderer, controls, currentLoadedModel, animationFrameId;
    
    // --- Konfiguracja Loaderów ---
    const loader = new GLTFLoader();
    const dracoLoader = new DRACOLoader(); 
    // Ustaw ścieżkę do plików dekodera DRACO.
    // Ta ścieżka jest dla unpkg. Jeśli hostujesz pliki lokalnie, dostosuj ją.
    dracoLoader.setDecoderPath('https://unpkg.com/three@0.160.0/examples/jsm/libs/draco/gltf/'); 
    loader.setDRACOLoader(dracoLoader); 

    // Loader dla miniaturek również musi mieć DRACO
    const thumbLoader = new GLTFLoader();
    thumbLoader.setDRACOLoader(dracoLoader); // Użyj tej samej instancji dracoLoader


    function initThree() {
        scene = new THREE.Scene();
        // scene.background = new THREE.Color(0x1a1a1a); 

        camera = new THREE.PerspectiveCamera(50, threeCanvasContainer.clientWidth / threeCanvasContainer.clientHeight, 0.1, 1000);
        camera.position.set(1.5, 1, 2.5);

        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setSize(threeCanvasContainer.clientWidth, threeCanvasContainer.clientHeight);
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.outputColorSpace = THREE.SRGBColorSpace; 
        threeCanvasContainer.appendChild(renderer.domElement);

        controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.05;
        controls.screenSpacePanning = true; 
        controls.minDistance = 0.1;
        controls.maxDistance = 50;
        controls.autoRotate = false; 
        controls.autoRotateSpeed = 0.7;
        controls.target.set(0, 0.5, 0); 

        const ambientLight = new THREE.AmbientLight(0xffffff, 1.2); 
        scene.add(ambientLight);

        const directionalLight1 = new THREE.DirectionalLight(0xffffff, 1.5);
        directionalLight1.position.set(5, 10, 7.5);
        scene.add(directionalLight1);
        
        const directionalLight2 = new THREE.DirectionalLight(0xffffff, 1);
        directionalLight2.position.set(-5, 5, -7.5);
        scene.add(directionalLight2);
        
        const hemisphereLight = new THREE.HemisphereLight(0xffffbb, 0x080820, 0.8); 
        scene.add(hemisphereLight);
    }

    function startAnimation() {
        if (!animationFrameId) {
            animate();
        }
    }

    function stopAnimation() {
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = null;
        }
    }

    function animate() {
        animationFrameId = requestAnimationFrame(animate);
        controls.update(); 
        renderer.render(scene, camera);
    }

    function loadGLBModel(modelPath) {
        spinner.style.display = 'block';
        controls.autoRotate = false; 
        
        if (currentLoadedModel) {
            disposeModel(currentLoadedModel); 
            currentLoadedModel = null;
        }

        loader.load( // Używamy głównego loadera skonfigurowanego z DRACO
            modelPath,
            (gltf) => {
                currentLoadedModel = gltf.scene;
                
                currentLoadedModel.traverse((child) => {
                    if (child.isMesh) {
                        child.castShadow = true; 
                        child.receiveShadow = true; 
                        if (child.material) {
                            if (Array.isArray(child.material)) {
                                child.material.forEach(mat => adjustMaterial(mat));
                            } else {
                                adjustMaterial(child.material);
                            }
                        }
                    }
                });

                scene.add(currentLoadedModel);
                fitCameraToCenteredObject(currentLoadedModel, 1.8, 0.3); 
                spinner.style.display = 'none';
                controls.autoRotate = true;
                startAnimation(); 
            },
            undefined, 
            (error) => {
                console.error(`An error happened while loading the model ${modelPath}:`, error);
                spinner.style.display = 'none';
                startAnimation(); 
            }
        );
    }
    
    function adjustMaterial(material) {
        if (material.isMeshStandardMaterial) {
            material.metalness = material.metalness > 0.1 ? material.metalness : 0.05; 
            material.roughness = material.roughness < 0.9 ? material.roughness : 0.95; 
            material.needsUpdate = true;
        }
    }

    function disposeModel(model) {
        if (!model) return;
        model.traverse(object => {
            if (object.isMesh) {
                if (object.geometry) {
                    object.geometry.dispose();
                }
                if (object.material) {
                    const materials = Array.isArray(object.material) ? object.material : [object.material];
                    materials.forEach(material => {
                        for (const key in material) {
                            if (material[key] && typeof material[key].dispose === 'function' && material[key].isTexture) {
                                material[key].dispose();
                            }
                        }
                        if (typeof material.dispose === 'function') {
                           material.dispose();
                        }
                    });
                }
            }
        });
        if (model.parent) {
            model.parent.remove(model);
        }
    }

    function fitCameraToCenteredObject(object, offsetFactor = 1.5, verticalOffsetRatio = 0.0) { // verticalOffsetRatio zamiast verticalOffset
        const boundingBox = new THREE.Box3().setFromObject(object);
        const center = boundingBox.getCenter(new THREE.Vector3());
        const size = boundingBox.getSize(new THREE.Vector3());

        const maxDim = Math.max(size.x, size.y, size.z);
        const fov = camera.fov * (Math.PI / 180);
        let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));
        cameraZ *= offsetFactor; 

        // Ustaw pozycję kamery, uwzględniając środek i wysokość obiektu
        camera.position.set(
            center.x, 
            center.y + size.y * verticalOffsetRatio, // Przesunięcie pionowe względem środka wysokości obiektu
            center.z + cameraZ
        );
        
        const minZ = boundingBox.min.z;
        const cameraToFarEdge = (minZ < 0) ? -minZ + cameraZ : cameraZ - minZ;

        camera.far = cameraToFarEdge * 3;
        camera.near = Math.max(0.01, cameraToFarEdge / 1000); // Upewnij się, że near jest małe, ale nie zero
        camera.updateProjectionMatrix();

        // Ustaw cel kontrolera na środek obiektu, również z uwzględnieniem verticalOffsetRatio
        controls.target.set(
            center.x,
            center.y + size.y * verticalOffsetRatio,
            center.z
        );
        controls.maxDistance = cameraZ * 5; 
        controls.minDistance = Math.max(0.01, cameraZ * 0.1); // minDistance również nie powinno być zerowe
        controls.update();
    }


    // --- Thumbnail Generation ---
    const thumbScene = new THREE.Scene();
    const thumbCamera = new THREE.PerspectiveCamera(30, 1, 0.1, 100); // aspect 1:1, fov 30
    const thumbRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    thumbRenderer.setSize(180, 180); 
    thumbRenderer.outputColorSpace = THREE.SRGBColorSpace;

    const thumbAmbientLight = new THREE.AmbientLight(0xffffff, 1.5);
    thumbScene.add(thumbAmbientLight);
    const thumbDirectionalLight = new THREE.DirectionalLight(0xffffff, 2);
    thumbDirectionalLight.position.set(3, 5, 4);
    thumbScene.add(thumbDirectionalLight);


    async function generateThumbnail(modelUrl, imgElement) {
        return new Promise((resolve, reject) => {
            thumbLoader.load( // Używamy thumbLoader skonfigurowanego z DRACO
                modelUrl,
                (gltf) => {
                    const model = gltf.scene;
                    
                    if (thumbScene.userData.currentThumbnailModel) {
                        disposeModel(thumbScene.userData.currentThumbnailModel);
                        // thumbScene.remove(thumbScene.userData.currentThumbnailModel); // disposeModel już to robi
                    }
                    thumbScene.add(model);
                    thumbScene.userData.currentThumbnailModel = model; 

                    model.traverse((child) => {
                        if (child.isMesh && child.material) {
                             if (Array.isArray(child.material)) {
                                child.material.forEach(mat => adjustMaterial(mat));
                            } else {
                                adjustMaterial(child.material);
                            }
                        }
                    });

                    const box = new THREE.Box3().setFromObject(model);
                    const center = box.getCenter(new THREE.Vector3());
                    const size = box.getSize(new THREE.Vector3());
                    
                    // Kadrowanie miniaturki
                    const maxDim = Math.max(size.x, size.y, size.z);
                    const fov = thumbCamera.fov * (Math.PI / 180);
                    const camDistance = (maxDim / (2 * Math.tan(fov / 2))) * 1.5; // Mnożnik dla odsunięcia

                    thumbCamera.position.set(
                        center.x + camDistance * 0.6, // Lekko z boku
                        center.y + size.y * 0.1 + camDistance * 0.4, // Lekko z góry, uwzględniając wysokość
                        center.z + camDistance * 0.9  // Główne odsunięcie
                    );
                    thumbCamera.lookAt(center.x, center.y + size.y * 0.15, center.z); // Celuj lekko powyżej środka
                    thumbCamera.updateProjectionMatrix();

                    thumbRenderer.render(thumbScene, thumbCamera);
                    const dataUrl = thumbRenderer.domElement.toDataURL('image/webp', 0.75); 
                    imgElement.src = dataUrl;
                    
                    resolve();
                },
                undefined,
                (error) => {
                    console.error(`Error loading model for thumbnail ${modelUrl}:`, error);
                    imgElement.alt = "Error loading thumbnail"; 
                    imgElement.src = "assets/card/fallback.webp"; // Upewnij się, że ten plik istnieje
                    reject(error);
                }
            );
        });
    }


    // --- Main Logic ---
    async function fetchModels() {
        try {
            spinner.style.display = 'block';
            const response = await fetch(jsonUrl);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            models = await response.json();
            await displayModels(models); 
        } catch (error) {
            console.error('Błąd podczas pobierania danych:', error);
            modelGrid.innerHTML = "<p style='color:white; text-align:center;'>Nie udało się załadować modeli.</p>";
        } finally {
            spinner.style.display = 'none';
        }
    }

    async function displayModels(modelsToDisplay) {
        modelGrid.innerHTML = ''; 
        const thumbnailPromises = [];
        
        if (thumbScene.userData.currentThumbnailModel) {
            disposeModel(thumbScene.userData.currentThumbnailModel);
            thumbScene.userData.currentThumbnailModel = null;
        }

        for (const model of modelsToDisplay) { // Użyj for...of aby await działał poprawnie w pętli
            const card = document.createElement('div');
            card.classList.add('model-card');

            const img = document.createElement('img');
            img.alt = model.title; 
            // img.src = "assets/card/placeholder.webp"; // Możesz ustawić tymczasowy placeholder
            
            const titleEl = document.createElement('h2');
            titleEl.textContent = model.title;

            if (model.hands) {
                const handsTag = document.createElement('div');
                handsTag.classList.add('hands-tag');
                handsTag.textContent = model.hands === "1H" ? "Jednoręczna" : "Dwuręczna";
                handsTag.classList.add(model.hands === "1H" ? "one-handed" : "two-handed");
                card.appendChild(handsTag);
            }
            if (model.tier) {
                const tierTag = document.createElement('div');
                tierTag.classList.add('tier-tag');
                tierTag.textContent = model.tier;
                tierTag.classList.add(`tier-${model.tier.toLowerCase()}`);
                card.appendChild(tierTag);
            }

            card.appendChild(img);
            card.appendChild(titleEl);
            modelGrid.appendChild(card);

            // Kolejkuj generowanie miniaturek
            thumbnailPromises.push(generateThumbnail(model.model, img).catch(err => { /* błąd już obsłużony w generateThumbnail */ }));
        }

        // Poczekaj, aż wszystkie miniaturki (lub próby ich wygenerowania) się zakończą
        await Promise.allSettled(thumbnailPromises);
        
        // Ostateczne czyszczenie po serii miniaturek
        if (thumbScene.userData.currentThumbnailModel) {
            disposeModel(thumbScene.userData.currentThumbnailModel);
            thumbScene.userData.currentThumbnailModel = null;
        }

        // Dodaj obsługę kliknięć PO tym, jak wszystkie karty są w DOM
        document.querySelectorAll('.model-card').forEach((cardElement, index) => {
            // Znajdź odpowiedni model na podstawie kolejności lub unikalnego identyfikatora, jeśli go dodasz
            const modelData = modelsToDisplay[index]; 
            if (modelData) {
                cardElement.addEventListener('click', () => {
                    document.getElementById('model-title').textContent = modelData.title;
                    document.getElementById('model-description').textContent = modelData.description;
                    
                    modelViewerContainer.style.display = 'flex';
                    
                    if (renderer) { 
                        setTimeout(() => { 
                            const newWidth = threeCanvasContainer.clientWidth;
                            const newHeight = threeCanvasContainer.clientHeight;
                            if (newWidth > 0 && newHeight > 0) {
                                camera.aspect = newWidth / newHeight;
                                camera.updateProjectionMatrix();
                                renderer.setSize(newWidth, newHeight);
                            }
                            loadGLBModel(modelData.model); 
                        }, 50);
                    } else {
                        // To nie powinno się zdarzyć, bo initThree() jest wołane wcześniej
                        loadGLBModel(modelData.model); 
                    }
                });
            }
        });
    }
    
    initThree(); 
    
    window.addEventListener('resize', () => {
        if (modelViewerContainer.style.display === 'flex' && renderer && camera) { 
            const newWidth = threeCanvasContainer.clientWidth;
            const newHeight = threeCanvasContainer.clientHeight;
            if (newWidth > 0 && newHeight > 0) {
                camera.aspect = newWidth / newHeight;
                camera.updateProjectionMatrix();
                renderer.setSize(newWidth, newHeight);
            }
        }
    });

    fetchModels();

    categoryButtons.forEach(button => {
        button.addEventListener('click', async () => { 
            const category = button.getAttribute('data-category');
            spinner.style.display = 'block'; 
            await new Promise(resolve => setTimeout(resolve, 10)); 
            
            let filteredModels;
            if (category === 'all') {
                filteredModels = models;
            } else {
                filteredModels = models.filter(model => model.category === category);
            }
            await displayModels(filteredModels); // Przekaż odfiltrowane modele
            spinner.style.display = 'none';
        });
    });

    closeViewer.addEventListener('click', () => {
        modelViewerContainer.style.display = 'none';
        stopAnimation(); 
        controls.autoRotate = false;
        if (currentLoadedModel) {
            disposeModel(currentLoadedModel); 
            currentLoadedModel = null;
        }
    });
});