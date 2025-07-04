import {loadGLTF} from "./libs/loader.js";
import {mockWithVideo} from './libs/camera-mock.js';
const THREE = window.MINDAR.IMAGE.THREE;

// variables globales para el juego de matematicas
let currentProblem = {};
let correctAnswers = 0;
let incorrectAnswers = 0;
let totalCorrectAnswers = 0; // puntuacion total acumulada
let currentLevel = 1;
let correctAnswersInLevel = 0; // respuestas correctas en el nivel actual
let lives = 10; // sistema de vidas - comienza con 10
let gameActive = false;
let fallingNumbers = [];
let gameArea;
let mindarThree;
let anchor;
let lastDetectionTime = 0;
let detectionCooldown = 2000; // 2 segundos de cooldown entre detecciones
let robotMixer; // mixer para animaciones del robot
let jumpAction; // accion de salto del robot
let deathAction; // accion de muerte del robot

// configuracion de niveles
const LEVEL_CONFIG = {
  answersPerLevel: 15,
  levels: {
    1: {
      name: "Principiante",
      speed: { min: 2, max: 4 },
      addition: { min: 1, max: 9 },
      subtraction: { min: 5, max: 15 },
      multiplication: { min: 1, max: 3 }
    },
    2: {
      name: "Intermedio",
      speed: { min: 2.5, max: 4.5 },
      addition: { min: 10, max: 50 },
      subtraction: { min: 20, max: 50 },
      multiplication: { min: 1, max: 5 }
    },
    3: {
      name: "Avanzado",
      speed: { min: 3, max: 5 },
      addition: { min: 45, max: 200 },
      subtraction: { min: 60, max: 200 },
      multiplication: { min: 1, max: 10 }
    },
    4: {
      name: "Experto",
      speed: { min: 3.5, max: 5.5 },
      addition: { min: 200, max: 1000 },
      subtraction: { min: 300, max: 1000 },
      multiplication: { min: 1, max: 12 }
    }
  }
};

// funcion para generar problemas matematicos aleatorios
function generateMathProblem() {
  const operations = ['+', '-', '*'];
  const operation = operations[Math.floor(Math.random() * operations.length)];
  const levelConfig = LEVEL_CONFIG.levels[currentLevel] || LEVEL_CONFIG.levels[4];
  
  let num1, num2, answer;
  
  switch(operation) {
    case '+':
      if (currentLevel === 1) {
        // nivel 1: sumas de un digito (1-9) + (1-9)
        num1 = Math.floor(Math.random() * 9) + 1;
        num2 = Math.floor(Math.random() * 9) + 1;
      } else {
        const range = levelConfig.addition.max - levelConfig.addition.min;
        num1 = Math.floor(Math.random() * range) + levelConfig.addition.min;
        num2 = Math.floor(Math.random() * Math.min(range, 200)) + 1;
      }
      answer = num1 + num2;
      break;
    case '-':
      if (currentLevel === 1) {
        // nivel 1: restas simples (5-15) - (1-9)
        num1 = Math.floor(Math.random() * 11) + 5; // 5 a 15
        num2 = Math.floor(Math.random() * Math.min(num1 - 1, 9)) + 1; // maximo 9 y menor que num1
      } else {
        const range = levelConfig.subtraction.max - levelConfig.subtraction.min;
        num1 = Math.floor(Math.random() * range) + levelConfig.subtraction.min;
        num2 = Math.floor(Math.random() * (num1 - 1)) + 1;
      }
      answer = num1 - num2;
      break;
    case '*':
      if (currentLevel === 1) {
        // nivel 1: multiplicaciones muy basicas (1-3) x (1-3)
        num1 = Math.floor(Math.random() * 3) + 1;
        num2 = Math.floor(Math.random() * 3) + 1;
      } else {
        const maxMultiplier = levelConfig.multiplication.max;
        if (currentLevel >= 4) {
          num1 = Math.floor(Math.random() * 15) + 10;
          num2 = Math.floor(Math.random() * 15) + 10;
        } else {
          num1 = Math.floor(Math.random() * maxMultiplier) + 1;
          num2 = Math.floor(Math.random() * maxMultiplier) + 1;
        }
      }
      answer = num1 * num2;
      break;
  }
  
  return {
    problem: `${num1} ${operation} ${num2} = ?`,
    answer: answer,
    num1: num1,
    num2: num2,
    operation: operation
  };
}

// funcion para generar respuestas incorrectas
function generateWrongAnswers(correctAnswer) {
  const wrongAnswers = new Set();
  
  while (wrongAnswers.size < 3) {
    let wrong;
    if (Math.random() < 0.5) {
      // respuesta cercana al resultado correcto
      wrong = correctAnswer + Math.floor(Math.random() * 10) - 5;
    } else {
      // respuesta mas aleatoria
      wrong = Math.floor(Math.random() * Math.max(100, correctAnswer * 2)) + 1;
    }
    
    if (wrong !== correctAnswer && wrong > 0) {
      wrongAnswers.add(wrong);
    }
  }
  
  return Array.from(wrongAnswers);
}

// funcion para crear un numero que cae
function createFallingNumber(number, isCorrect, delay = 0, position = 0) {
  setTimeout(() => {
    const numberElement = document.createElement('div');
    numberElement.className = `falling-number ${isCorrect ? 'correct' : 'incorrect'}`;
    numberElement.textContent = number;
    
    // calcular posicion x con espaciado uniforme
    const numberWidth = 80; // ancho del circulo del numero
    const totalNumbers = 4;
    const screenWidth = window.innerWidth;
    const usableWidth = screenWidth - (numberWidth * totalNumbers);
    const spacing = usableWidth / (totalNumbers + 1);
    const xPosition = spacing + (position * (numberWidth + spacing));
    
    numberElement.style.left = xPosition + 'px';
    numberElement.style.top = '-80px';
    
    gameArea.appendChild(numberElement);
    
    // velocidad basada en el nivel
    const levelConfig = LEVEL_CONFIG.levels[currentLevel] || LEVEL_CONFIG.levels[4];
    const speed = levelConfig.speed.min + Math.random() * (levelConfig.speed.max - levelConfig.speed.min);
    
    const numberObj = {
      element: numberElement,
      speed: speed,
      isCorrect: isCorrect,
      number: number,
      position: position
    };
    
    fallingNumbers.push(numberObj);
  }, delay);
}

// funcion para manejar la deteccion ar de un numero
function handleARDetection(number, isCorrect, element) {
  const resultDiv = document.getElementById('result');
  
  // aplicar efecto visual inmediatamente
  if (isCorrect) {
    element.classList.add('flash-correct');
    element.style.background = 'linear-gradient(135deg,rgb(11, 245, 18) 0%,rgb(0, 255, 13) 100%)'; // verde
    element.style.color = '#ffffff';
    element.style.boxShadow = '0 4px 12px rgba(76, 175, 80, 0.6)';
    resultDiv.textContent = '¡Correcto!';
    resultDiv.className = 'correct';
    correctAnswers++;
    totalCorrectAnswers++;
    correctAnswersInLevel++;
    createExplosion(element);
    
    // hacer que el robot salte
    playRobotJump();
    
    // verificar si se debe subir de nivel
    if (correctAnswersInLevel >= LEVEL_CONFIG.answersPerLevel) {
      levelUp();
    }
  } else {
    element.classList.add('flash-incorrect');
    element.style.background = 'linear-gradient(135deg,rgb(255, 17, 0) 0%,rgb(255, 0, 0) 100%)'; // rojo
    element.style.color = '#ffffff';
    element.style.boxShadow = '0 4px 12px rgba(244, 67, 54, 0.6)';
    resultDiv.textContent = `Incorrecto. La respuesta era ${currentProblem.answer}`;
    resultDiv.className = 'incorrect';
    incorrectAnswers++;
    
    // perder una vida por respuesta incorrecta
    loseLife();
  }
  
  updateScore();
  
  // limpiar numeros que caen despues del efecto
  setTimeout(() => {
    clearFallingNumbers();
  }, 300);
  
  // generar nuevo problema despues de un momento
  setTimeout(() => {
    if (gameActive) {
      startNewRound();
    }
  }, 2000);
}

// funcion para detectar colision entre ar y numeros
function checkARCollision() {
  if (!anchor || !gameActive || fallingNumbers.length === 0) return;
  
  const currentTime = Date.now();
  if (currentTime - lastDetectionTime < detectionCooldown) return;
  
  // obtener posicion del anchor en coordenadas de pantalla
  const anchorWorldPosition = new THREE.Vector3();
  anchor.group.getWorldPosition(anchorWorldPosition);
  
  // convertir a coordenadas de pantalla
  const {camera, renderer} = mindarThree;
  const screenPosition = anchorWorldPosition.clone();
  screenPosition.project(camera);
  
  const screenX = (screenPosition.x * 0.5 + 0.5) * renderer.domElement.clientWidth;
  const screenY = (screenPosition.y * -0.5 + 0.5) * renderer.domElement.clientHeight;
  
  // verificar colision con numeros que caen
  fallingNumbers.forEach(numberObj => {
    const numberRect = numberObj.element.getBoundingClientRect();
    const numberCenterX = numberRect.left + numberRect.width / 2;
    const numberCenterY = numberRect.top + numberRect.height / 2;
    
    // calcular distancia entre el anchor y el numero
    const distance = Math.sqrt(
      Math.pow(screenX - numberCenterX, 2) + 
      Math.pow(screenY - numberCenterY, 2)
    );
    
    // si la distancia es menor a 100 pixels, consideramos que hay colision
    if (distance < 100) {
      lastDetectionTime = currentTime;
      handleARDetection(numberObj.number, numberObj.isCorrect, numberObj.element);
    }
  });
}

// funcion para crear efecto de explosion
function createExplosion(element) {
  const rect = element.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  
  for (let i = 0; i < 12; i++) {
    const particle = document.createElement('div');
    particle.className = 'explosion-particle';
    
    const angle = (i / 12) * Math.PI * 2;
    const distance = 50 + Math.random() * 30;
    const endX = centerX + Math.cos(angle) * distance;
    const endY = centerY + Math.sin(angle) * distance;
    
    particle.style.left = centerX + 'px';
    particle.style.top = centerY + 'px';
    particle.style.transform = `translate(${endX - centerX}px, ${endY - centerY}px)`;
    
    gameArea.appendChild(particle);
    
    setTimeout(() => {
      if (particle.parentNode) {
        particle.parentNode.removeChild(particle);
      }
    }, 800);
  }
}

// funcion para limpiar numeros que caen
function clearFallingNumbers() {
  fallingNumbers.forEach(numberObj => {
    if (numberObj.element.parentNode) {
      numberObj.element.parentNode.removeChild(numberObj.element);
    }
  });
  fallingNumbers = [];
}

// funcion para actualizar el problema matematico
function updateMathProblem() {
  currentProblem = generateMathProblem();
  document.getElementById('math-problem').textContent = currentProblem.problem;
  document.getElementById('result').textContent = '';
  document.getElementById('result').className = '';
}

// funcion para iniciar una nueva ronda
function startNewRound() {
  if (!gameActive) return;
  
  updateMathProblem();
  
  // generar respuestas
  const wrongAnswers = generateWrongAnswers(currentProblem.answer);
  const allAnswers = [currentProblem.answer, ...wrongAnswers];
  
  // mezclar las respuestas
  for (let i = allAnswers.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [allAnswers[i], allAnswers[j]] = [allAnswers[j], allAnswers[i]];
  }
  
  // crear numeros que caen con pequenos delays y posiciones uniformes
  allAnswers.forEach((answer, index) => {
    const isCorrect = answer === currentProblem.answer;
    const delay = index * 200; // 200ms de diferencia entre cada numero
    createFallingNumber(answer, isCorrect, delay, index);
  });
}

// funcion para animar los numeros que caen
function animateFallingNumbers() {
  fallingNumbers.forEach((numberObj, index) => {
    const currentTop = parseFloat(numberObj.element.style.top);
    numberObj.element.style.top = (currentTop + numberObj.speed) + 'px';
    
    // remover si sale de la pantalla
    if (currentTop > window.innerHeight) {
      // si el numero que sale de la pantalla era la respuesta correcta, perder una vida
      if (numberObj.isCorrect) {
        loseLife();
        const resultDiv = document.getElementById('result');
        resultDiv.textContent = `¡Se escapó la respuesta correcta! Era ${currentProblem.answer}`;
        resultDiv.className = 'incorrect';
      }
      
      if (numberObj.element.parentNode) {
        numberObj.element.parentNode.removeChild(numberObj.element);
      }
      fallingNumbers.splice(index, 1);
      
      // si no quedan numeros y el juego esta activo, iniciar nueva ronda
      if (fallingNumbers.length === 0 && gameActive) {
        setTimeout(() => {
          if (gameActive && fallingNumbers.length === 0) {
            startNewRound();
          }
        }, 1000);
      }
    }
  });
}

// funcion para actualizar el marcador
function updateScore() {
  document.getElementById('score').textContent = 
    `Nivel ${currentLevel} | Total: ${totalCorrectAnswers} | Vidas: ${lives}`;
  
  // actualizar progreso del nivel
  const progress = correctAnswersInLevel;
  const needed = LEVEL_CONFIG.answersPerLevel;
  document.getElementById('level-progress').textContent = 
    `Progreso: ${progress}/${needed} para siguiente nivel`;
}

// funcion para actualizar el display de vidas con corazones
function updateLivesDisplay() {
  let livesDisplay = document.getElementById('lives-display');
  
  // crear el display de vidas si no existe
  if (!livesDisplay) {
    livesDisplay = document.createElement('div');
    livesDisplay.id = 'lives-display';
    livesDisplay.style.cssText = `
      position: fixed;
      top: 20px;
      left: 20px;
      font-size: 24px;
      z-index: 1000;
      background: rgba(0, 0, 0, 0.7);
      padding: 10px;
      border-radius: 10px;
      color: white;
      font-family: Arial, sans-serif;
    `;
    document.body.appendChild(livesDisplay);
  }
  
  // generar corazones segun las vidas
  let hearts = '';
  for (let i = 0; i < lives; i++) {
    hearts += '❤️';
  }
  
  livesDisplay.innerHTML = hearts || '💀'; // mostrar skull si no hay vidas
}

// funcion para subir de nivel
function levelUp() {
  currentLevel++;
  correctAnswersInLevel = 0;
  
  // ganar 3 vidas al subir de nivel
  lives += 3;
  
  // mostrar animacion de subida de nivel
  showLevelUpAnimation();
  
  // actualizar indicador de nivel
  updateScore();
  updateLivesDisplay();
}

// funcion para mostrar animacion de subida de nivel
function showLevelUpAnimation() {
  const levelUpDiv = document.createElement('div');
  levelUpDiv.id = 'level-up-animation';
  levelUpDiv.innerHTML = `
    <div class="level-up-content">
      <div class="level-up-title">¡NIVEL SUBIDO!</div>
      <div class="level-up-number">NIVEL ${currentLevel}</div>
      <div class="level-up-subtitle">${LEVEL_CONFIG.levels[currentLevel]?.name || 'Maestro'}</div>
      <div class="level-up-message">¡La dificultad ha aumentado!</div>
      <div class="level-up-bonus">+3 Vidas Bonus!</div>
    </div>
  `;
  
  document.body.appendChild(levelUpDiv);
  
  // remover despues de 3 segundos
  setTimeout(() => {
    if (levelUpDiv.parentNode) {
      levelUpDiv.parentNode.removeChild(levelUpDiv);
    }
  }, 3000);
}

// funcion para perder una vida
function loseLife() {
  lives--;
  updateScore();
  updateLivesDisplay();
  
  // verificar si se acabaron las vidas
  if (lives <= 0) {
    gameOver();
  }
}

// funcion para terminar el juego
function gameOver() {
  gameActive = false;
  clearFallingNumbers();
  
  // hacer que el robot muera
  playRobotDeath();
  
  // crear overlay oscuro con mensaje "perdiste"
  const gameOverOverlay = document.createElement('div');
  gameOverOverlay.id = 'game-over-overlay';
  gameOverOverlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    z-index: 9999;
    font-family: Arial, sans-serif;
    cursor: pointer;
  `;
  
  gameOverOverlay.innerHTML = `
    <div style="
      color: white;
      font-size: 48px;
      font-weight: bold;
      text-align: center;
      text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.8);
      margin-bottom: 20px;
    ">
      PERDISTE
    </div>
    <div style="
      color: white;
      font-size: 24px;
      text-align: center;
      text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.8);
      opacity: 0.8;
    ">
      Toca la pantalla para jugar de nuevo
    </div>
  `;
  
  document.body.appendChild(gameOverOverlay);
  
  // agregar event listener para click en cualquier parte de la pantalla
  const handleRestart = () => {
    if (gameOverOverlay.parentNode) {
      gameOverOverlay.parentNode.removeChild(gameOverOverlay);
    }
    // remover el event listener para evitar multiples clicks
    gameOverOverlay.removeEventListener('click', handleRestart);
    startGame();
  };
  
  // escuchar click en el overlay
  gameOverOverlay.addEventListener('click', handleRestart);
}

// funcion para iniciar el juego
function startGame() {
  gameActive = true;
  currentLevel = 1;
  correctAnswers = 0;
  incorrectAnswers = 0;
  totalCorrectAnswers = 0;
  correctAnswersInLevel = 0;
  lives = 1; // reiniciar vidas a 10

    
  // revivir el robot al reiniciar
  reviveRobot();
  
  document.getElementById('instructions').style.display = 'none';
  updateScore();
  updateLivesDisplay();
  startNewRound();
}

document.addEventListener('DOMContentLoaded', () => {
  const start = async() => {
    gameArea = document.getElementById('game-area');
    
    // event listeners para los botones
    document.getElementById('start-game-button').addEventListener('click', startGame);
    document.getElementById('new-problem-button').addEventListener('click', () => {
      if (gameActive) {
        clearFallingNumbers();
        startNewRound();
      }
    });

    // configuracion de mindar
    mindarThree = new window.MINDAR.IMAGE.MindARThree({
      container: document.body,
      imageTargetSrc: '/static/assets/targets/carnet.mind',
    });
    const {renderer, scene, camera} = mindarThree;

    // iluminacion
    const light = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 1);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.6);
    directionalLight.position.set(-0.5, 1, 1);
    scene.add(light);
    scene.add(directionalLight);

    // cargar modelo base
    try {
      const baseModel = await loadGLTF('/static/assets/models/robot/RobotExpressive.glb');
      baseModel.scene.scale.set(0.1, 0.1, 0.1);
      
      // centrar el robot exactamente en el punto de referencia (centro del anchor)
      baseModel.scene.position.set(0, 0, 0);
      
      // rotar el robot para que este parado y mirando al usuario
      baseModel.scene.rotation.x = Math.PI; // 180 grados en x para pararlo
      baseModel.scene.rotation.y = Math.PI; // 180 grados en y para que mire al usuario
      baseModel.scene.rotation.z = Math.PI/2; // 90 grados en z para orientacion final

      // configurar animaciones del robot
      if (baseModel.animations && baseModel.animations.length > 0) {
        robotMixer = new THREE.AnimationMixer(baseModel.scene);
        
        // buscar la animacion de salto
        const jumpAnimation = baseModel.animations.find(anim => 
          anim.name.toLowerCase().includes('jump') || 
          anim.name.toLowerCase().includes('salto')
        );
        
        // buscar la animacion de muerte
        const deathAnimation = baseModel.animations.find(anim => 
          anim.name.toLowerCase().includes('death') || 
          anim.name.toLowerCase().includes('muerte') ||
          anim.name.toLowerCase().includes('die')
        );
        
        if (jumpAnimation) {
          jumpAction = robotMixer.clipAction(jumpAnimation);
          jumpAction.setLoop(THREE.LoopOnce); // solo reproducir una vez
          jumpAction.clampWhenFinished = true; // mantener la pose final
        } else {
          console.log('animacion de salto no encontrada, usando la primera animacion disponible');
          jumpAction = robotMixer.clipAction(baseModel.animations[0]);
          jumpAction.setLoop(THREE.LoopOnce);
          jumpAction.clampWhenFinished = true;
        }
        
        if (deathAnimation) {
          deathAction = robotMixer.clipAction(deathAnimation);
          deathAction.setLoop(THREE.LoopOnce); // solo reproducir una vez
          deathAction.clampWhenFinished = true; // mantener la pose final
        } else {
          console.log('animacion de muerte no encontrada');
        }
        
        console.log('animaciones disponibles:', baseModel.animations.map(anim => anim.name));
      }

      anchor = mindarThree.addAnchor(0);
      anchor.group.add(baseModel.scene);
      
      // agregar punto de referencia visual en el centro del anchor (mismo punto que el robot)
      const referencePointGeometry = new THREE.SphereGeometry(0.02, 16, 16);
      const referencePointMaterial = new THREE.MeshBasicMaterial({ 
        color: 0xff0000, // color rojo brillante
        transparent: true,
        opacity: 0.8
      });
      const referencePoint = new THREE.Mesh(referencePointGeometry, referencePointMaterial);
      
      // posicionar el punto de referencia en el centro del anchor (mismo punto que el robot)
      referencePoint.position.set(0, 0, 0);
      
      // agregar animacion de pulsacion al punto de referencia
      referencePoint.userData = {
        originalScale: 1,
        pulseSpeed: 0.05,
        time: 0
      };
      
      anchor.group.add(referencePoint);
      
      // guardar referencia para animacion
      window.referencePoint = referencePoint;
    } catch (error) {
      console.log('no se pudo cargar el modelo 3d, continuando sin el');
      anchor = mindarThree.addAnchor(0);
    }

    await mindarThree.start();
    
    // loop de animacion
    renderer.setAnimationLoop(() => {
      // animar numeros que caen
      animateFallingNumbers();
      
      // verificar colision ar con numeros
      checkARCollision();
      
      // actualizar animaciones del robot
      if (robotMixer) {
        robotMixer.update(0.016); // 60 fps
      }
      
      // animar el punto de referencia con efecto de pulsacion
      if (window.referencePoint) {
        window.referencePoint.userData.time += window.referencePoint.userData.pulseSpeed;
        const scale = window.referencePoint.userData.originalScale + 
                     Math.sin(window.referencePoint.userData.time) * 0.3;
        window.referencePoint.scale.set(scale, scale, scale);
      }
      
      renderer.render(scene, camera);
    });
  }
  start();
});

// funcion para hacer que el robot salte
function playRobotJump() {
  if (jumpAction) {
    // primer salto
    jumpAction.reset();
    jumpAction.play();
    console.log('robot saltando - primer salto!');
    
    // segundo salto despues de que termine el primero
    setTimeout(() => {
      if (jumpAction) {
        jumpAction.reset();
        jumpAction.play();
        console.log('robot saltando - segundo salto!');
      }
    }, 1000); // esperar 1 segundo entre saltos
  }
}

// funcion para hacer que el robot muera
function playRobotDeath() {
  if (deathAction) {
    deathAction.reset();
    deathAction.play();
    console.log('robot muriendo!');
  }
}




// funcion para revivir el robot (reiniciar pose)
function reviveRobot() {
  if (deathAction) {
    deathAction.stop();
    deathAction.reset();
    console.log('robot revivido!');
  }
  if (jumpAction) {
    jumpAction.stop();
    jumpAction.reset();
  }
}
