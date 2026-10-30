// The page's fixed elements, looked up once in `Renderer.init` before any game
// exists. Cast without null checks, as they always were: `index.html` has
// them all.
export interface AppElements {
  notificationArea: HTMLElement;
  mainMenuElement: HTMLElement;
  actionArea: HTMLElement;
  secondaryActionArea: HTMLElement;
  unitActionArea: HTMLElement;
  gameMenu: HTMLElement;
  gameArea: HTMLElement;
  mapWrapper: HTMLElement;
  mapPortal: HTMLCanvasElement;
  gameInfo: HTMLElement;
  playerInfo: HTMLElement;
  minimapCanvas: HTMLCanvasElement;
  unitInfo: HTMLCanvasElement;
  // The sidebar's lists of cities (#700) and power (#701, #708). Only these may be missing: a page without them goes without
  //  the lists.
  citiesList: HTMLElement | null;
  powerList: HTMLElement | null;
}

export const appElements = (): AppElements => {
  const notificationArea = document.getElementById(
      'notification'
    ) as HTMLElement,
    mainMenuElement = document.querySelector('#mainmenu') as HTMLElement,
    actionArea = document.getElementById('actions') as HTMLElement,
    secondaryActionArea = document.getElementById(
      'other-actions'
    ) as HTMLElement,
    unitActionArea = document.getElementById('unit-actions') as HTMLElement,
    gameMenu = document.getElementById('game-menu') as HTMLElement,
    gameArea = document.getElementById('game') as HTMLElement,
    mapWrapper = document.getElementById('map') as HTMLElement,
    mapPortal = mapWrapper.querySelector('canvas') as HTMLCanvasElement,
    gameInfo = document.getElementById('gameDetails') as HTMLElement,
    playerInfo = document.getElementById('playerDetails') as HTMLElement,
    minimapCanvas = document.getElementById('minimap') as HTMLCanvasElement,
    unitInfo = document.getElementById('unitInfo') as HTMLCanvasElement,
    citiesList = document.getElementById('citiesList'),
    powerList = document.getElementById('powerList');

  return {
    notificationArea,
    mainMenuElement,
    actionArea,
    secondaryActionArea,
    unitActionArea,
    gameMenu,
    gameArea,
    mapWrapper,
    mapPortal,
    gameInfo,
    playerInfo,
    minimapCanvas,
    unitInfo,
    citiesList,
    powerList,
  };
};

export default appElements;
