/// <reference types="vite/client" />

interface Window {
  __nightshift?: import('./game/engine').HospitalEngine;
}