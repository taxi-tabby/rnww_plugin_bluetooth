/**
 * 플랫폼 추상화 인터페이스
 */
export interface IPlatform {
  /**
   * 현재 실행 중인 플랫폼
   */
  OS: 'ios' | 'android' | 'windows' | 'macos' | 'web';
}
