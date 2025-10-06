const createStm32Simulator = require('./createStm32Simulator');

// Create and run 15 simulators
for (let i = 1; i <= 5; i++) {
    const deviceID = `STM32-Simulator-${String(i).padStart(3, '0')}`;
    createStm32Simulator(deviceID);
}
