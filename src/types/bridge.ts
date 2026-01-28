/**
 * 브릿지 통신 추상화 인터페이스
 */

/**
 * 브릿지 통신 인터페이스
 * 기존 프로젝트와의 호환성을 위해 타입을 느슨하게 설정
 */
export interface IBridge {
  /**
   * 네이티브에서 호출할 수 있는 핸들러를 등록합니다
   * @param eventName 이벤트 이름
   * @param handler 핸들러 함수
   */
  registerHandler(eventName: string, handler: any): void;

  /**
   * 웹으로 메시지를 전송합니다
   * @param eventName 이벤트 이름
   * @param data 전송할 데이터
   */
  sendToWeb(eventName: string, data: any): void;
}
