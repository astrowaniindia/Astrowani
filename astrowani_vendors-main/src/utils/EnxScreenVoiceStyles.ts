import { StyleSheet, Platform } from 'react-native';
import { COLORS } from '../Theme/Colors';
import { moderateScale as scaleWidth } from '../utils/Scaling';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.black,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.black,
  },
  loadingText: {
    color: COLORS.white,
    fontSize: scaleWidth(18),
  },
  backgroundContainer: {
    flex: 1,
    height: '100%',
    width: '100%',
    position: 'absolute',
  },
  userImage: {
    height: '100%',
    width: '100%',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  header: {
    backgroundColor: 'rgba(0,0,0,0.3)',
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: Platform.OS === 'ios' ? 100 : 80,
    paddingTop: Platform.OS === 'ios' ? 50 : 30,
    paddingHorizontal: scaleWidth(20),
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 10,
  },
  backButton: {
    padding: scaleWidth(10),
    borderRadius: scaleWidth(20),
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  centerBox: {
    justifyContent: 'center',
    alignItems: 'center',
    flex: 1,
  },
  statusText: {
    fontSize: scaleWidth(16),
    fontWeight: '500',
    color: COLORS.white,
  },
  rightPlaceholder: {
    width: scaleWidth(40),
  },
  contentContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: scaleWidth(40),
  },
  avatarContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: scaleWidth(30),
    position: 'relative',
  },
  ring: {
    position: 'absolute',
    width: scaleWidth(200),
    height: scaleWidth(200),
    borderRadius: scaleWidth(100),
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  avatarWrapper: {
    width: scaleWidth(150),
    height: scaleWidth(150),
    borderRadius: scaleWidth(75),
    borderWidth: 4,
    borderColor: 'rgba(255,255,255,0.2)',
    overflow: 'hidden',
  },
  avatar: {
    width: '100%',
    height: '100%',
  },
  userInfoContainer: {
    alignItems: 'center',
  },
  userName: {
    fontSize: scaleWidth(28),
    fontWeight: 'bold',
    color: COLORS.white,
    marginBottom: scaleWidth(8),
  },
  userDetails: {
    fontSize: scaleWidth(16),
    color: 'rgba(255,255,255,0.8)',
    marginBottom: scaleWidth(20),
  },
  callStatus: {
    fontSize: scaleWidth(18),
    color: COLORS.white,
    fontWeight: '600',
  },
  controlsContainer: {
    position: 'absolute',
    bottom: scaleWidth(60),
    left: 0,
    right: 0,
    paddingHorizontal: scaleWidth(40),
  },
  controlRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  controlButton: {
    alignItems: 'center',
    padding: scaleWidth(15),
    borderRadius: scaleWidth(25),
    backgroundColor: 'rgba(255,255,255,0.1)',
    minWidth: scaleWidth(70),
  },
  controlButtonActive: {
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  controlContent: {
    alignItems: 'center',
  },
  controlIcon: {
    width: scaleWidth(24),
    height: scaleWidth(24),
    tintColor: COLORS.white,
    marginBottom: scaleWidth(5),
  },
  controlText: {
    fontSize: scaleWidth(12),
    color: COLORS.white,
    marginTop: scaleWidth(4),
  },
  endCallButton: {
    alignItems: 'center',
    padding: scaleWidth(20),
    borderRadius: scaleWidth(30),
    backgroundColor: COLORS.red,
    minWidth: scaleWidth(80),
  },
  endCallIcon: {
    width: scaleWidth(40),
    height: scaleWidth(40),
    borderRadius: scaleWidth(20),
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: scaleWidth(5),
  },
  endCallText: {
    fontSize: scaleWidth(12),
    color: COLORS.white,
    fontWeight: '600',
  },
});

export default styles;